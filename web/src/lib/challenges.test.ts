import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Challenge } from './database.types'

// Stub encadenable por tabla. Cada método encadenable devuelve el builder; los
// terminales (`single`, `maybeSingle`) y la forma "thenable" resuelven con lo que
// fijemos en `results[table]`. `select` con `{ head: true }` devuelve `{ count }`.
const results: Record<string, { data?: unknown; error?: unknown; count?: number }> = {}
const calls = {
  from: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
}

function builderFor(table: string) {
  const builder: Record<string, unknown> = {}
  builder.select = (...args: unknown[]) => {
    calls.select(table, ...args)
    return builder
  }
  builder.eq = (...args: unknown[]) => {
    calls.eq(table, ...args)
    return builder
  }
  builder.in = (...args: unknown[]) => {
    calls.in(table, ...args)
    return builder
  }
  builder.insert = (...args: unknown[]) => {
    calls.insert(table, ...args)
    return builder
  }
  builder.upsert = (...args: unknown[]) => {
    calls.upsert(table, ...args)
    return builder
  }
  builder.update = (...args: unknown[]) => {
    calls.update(table, ...args)
    return builder
  }
  builder.delete = (...args: unknown[]) => {
    calls.delete(table, ...args)
    return builder
  }
  builder.single = () => Promise.resolve(results[table] ?? { data: null, error: null })
  builder.maybeSingle = () => Promise.resolve(results[table] ?? { data: null, error: null })
  builder.then = (resolve: (r: unknown) => unknown) =>
    resolve(results[table] ?? { data: null, error: null, count: 0 })
  return builder
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builderFor(table)
    },
  },
}))

import {
  createChallenge,
  getChallenge,
  getAnswer,
  getAnswers,
  countVotes,
  updateChallenge,
  isPracticeChallenge,
} from './challenges'

const sampleChallenge: Challenge = {
  id: 'c1',
  group_id: 'g1',
  title: 'Plaza Mayor',
  description: null,
  lat: 40.4155,
  lng: -3.7074,
  image_path: null,
  sv_pano_id: 'PANO123',
  sv_heading: 0,
  sv_pitch: 0,
  guess_seconds: 120,
  deadline_at: '2026-06-19T23:59:59.999Z',
  photo_is_hint: true,
  sv_lock_move: false,
  sv_lock_rotate: false,
  created_by: '00000000-0000-0000-0000-000000000001',
  created_at: '2026-06-19T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(results)) delete results[k]
})

describe('createChallenge', () => {
  test('inserta el reto; la respuesta la escribe el trigger 0012, no el cliente', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    const out = await createChallenge({
      title: 'Plaza Mayor',
      lat: 40.4155,
      lng: -3.7074,
      createdBy: '00000000-0000-0000-0000-000000000001',
      groupId: 'g1',
    })
    // El cliente NO escribe `challenge_answers`: lo hace el trigger
    // `sync_challenge_answer` (0012) en la misma transacción. Escribirlo desde el
    // cliente provocaba 42501 (RLS) al crear un miembro no-dueño.
    const wroteAnswer =
      calls.upsert.mock.calls.some((c) => c[0] === 'challenge_answers') ||
      calls.insert.mock.calls.some((c) => c[0] === 'challenge_answers')
    expect(wroteAnswer).toBe(false)
    expect(out.challenge).toEqual(sampleChallenge)
    expect(out.groupId).toBe('g1')
  })

  test('los candados de SV son false (explorable) por defecto', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    results['challenge_answers'] = { data: null, error: null }
    await createChallenge({
      title: 'x',
      lat: 1,
      lng: 2,
      createdBy: 'u',
      groupId: 'g1',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.sv_lock_move).toBe(false)
    expect(insertArg.sv_lock_rotate).toBe(false)
  })

  test('escribe los candados de SV cuando el creador los activa', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    results['challenge_answers'] = { data: null, error: null }
    await createChallenge({
      title: 'x',
      lat: 1,
      lng: 2,
      createdBy: 'u',
      groupId: 'g1',
      svLockMove: true,
      svLockRotate: true,
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.sv_lock_move).toBe(true)
    expect(insertArg.sv_lock_rotate).toBe(true)
  })
})

describe('getChallenge', () => {
  test('NO selecciona la respuesta (lat/lng) para el flujo de jugar', async () => {
    // La fila devuelta por el servidor ya no trae lat/lng (columnas explícitas).
    const { lat: _lat, lng: _lng, ...play } = sampleChallenge
    void _lat
    void _lng
    results['challenges'] = { data: play, error: null }
    const out = await getChallenge('c1')
    expect(calls.from).toHaveBeenCalledWith('challenges')
    // El select pide columnas explícitas SIN lat ni lng (no spoiler en el payload).
    const selectArg = calls.select.mock.calls.find((c) => c[0] === 'challenges')?.[1] as string
    expect(selectArg).toBeTypeOf('string')
    expect(selectArg).not.toMatch(/\blat\b/)
    expect(selectArg).not.toMatch(/\blng\b/)
    expect(calls.eq).toHaveBeenCalledWith('challenges', 'id', 'c1')
    expect(out).toEqual(play)
    // Defensa extra: el objeto devuelto no expone la respuesta.
    expect('lat' in out).toBe(false)
    expect('lng' in out).toBe(false)
  })

  test('propaga el error de Supabase (reto inexistente)', async () => {
    results['challenges'] = { data: null, error: new Error('no rows') }
    await expect(getChallenge('nope')).rejects.toThrow('no rows')
  })
})

describe('getAnswer', () => {
  test('lee la respuesta de challenge_answers (RLS decide si la sirve)', async () => {
    results['challenge_answers'] = { data: { lat: 40.4155, lng: -3.7074 }, error: null }
    const out = await getAnswer('c1')
    expect(calls.from).toHaveBeenCalledWith('challenge_answers')
    expect(calls.eq).toHaveBeenCalledWith('challenge_answers', 'challenge_id', 'c1')
    expect(out).toEqual({ lat: 40.4155, lng: -3.7074 })
  })

  test('devuelve null si el usuario aún no tiene derecho (sin fila)', async () => {
    results['challenge_answers'] = { data: null, error: null }
    expect(await getAnswer('c1')).toBeNull()
  })

  test('propaga el error', async () => {
    results['challenge_answers'] = { data: null, error: new Error('boom') }
    await expect(getAnswer('c1')).rejects.toThrow('boom')
  })
})

describe('getAnswers', () => {
  test('indexa por challenge_id las respuestas que la RLS sirve', async () => {
    results['challenge_answers'] = {
      data: [
        { challenge_id: 'c1', lat: 40.4, lng: -3.7 },
        { challenge_id: 'c2', lat: 41.3, lng: 2.1 },
      ],
      error: null,
    }
    const out = await getAnswers(['c1', 'c2'])
    expect(calls.in).toHaveBeenCalledWith('challenge_answers', 'challenge_id', ['c1', 'c2'])
    expect(out.get('c1')).toEqual({ lat: 40.4, lng: -3.7 })
    expect(out.get('c2')).toEqual({ lat: 41.3, lng: 2.1 })
  })

  test('lista vacía no consulta y devuelve un mapa vacío', async () => {
    const out = await getAnswers([])
    expect(out.size).toBe(0)
    expect(calls.in).not.toHaveBeenCalled()
  })
})

describe('countVotes', () => {
  test('devuelve el count exacto de votos del reto', async () => {
    results['votes'] = { error: null, count: 3 }
    expect(await countVotes('c1')).toBe(3)
    expect(calls.eq).toHaveBeenCalledWith('votes', 'challenge_id', 'c1')
  })

  test('count null cuenta como 0', async () => {
    results['votes'] = { error: null, count: undefined }
    expect(await countVotes('c1')).toBe(0)
  })
})

describe('updateChallenge', () => {
  test('edita campos simples sin tocar la ubicación', async () => {
    results['challenges'] = { data: { ...sampleChallenge, title: 'Nuevo' }, error: null }
    const out = await updateChallenge('c1', { title: 'Nuevo', guessSeconds: 60 })
    expect(calls.update).toHaveBeenCalledWith('challenges', { title: 'Nuevo', guess_seconds: 60 })
    // Sin cambio de ubicación, no se toca challenge_answers.
    expect(calls.update).not.toHaveBeenCalledWith('challenge_answers', expect.anything())
    expect(out.title).toBe('Nuevo')
  })

  test('cambiar la ubicación (sin votos) actualiza el reto; la respuesta la sincroniza el trigger', async () => {
    results['votes'] = { error: null, count: 0 }
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', {
      location: { lat: 1, lng: 2, svPanoId: 'P', svHeading: 10, svPitch: 5, svLockMove: true },
    })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      lat: 1,
      lng: 2,
      sv_pano_id: 'P',
      sv_heading: 10,
      sv_pitch: 5,
      // El candado activado se escribe; el otro cae al default permitido (false).
      sv_lock_move: true,
      sv_lock_rotate: false,
    })
    // El cliente NO escribe `challenge_answers`: el trigger 0012 la sincroniza al
    // detectar el UPDATE de lat/lng (evita el 42501 de RLS, única fuente).
    const wroteAnswer = calls.upsert.mock.calls.some((c) => c[0] === 'challenge_answers')
    expect(wroteAnswer).toBe(false)
  })

  test('RECHAZA cambiar la ubicación si el reto ya tiene votos', async () => {
    results['votes'] = { error: null, count: 2 }
    await expect(updateChallenge('c1', { location: { lat: 1, lng: 2 } })).rejects.toThrow(
      /ubicación/,
    )
    expect(calls.update).not.toHaveBeenCalled()
  })

  test('con votos, los campos no-ubicación SÍ se pueden editar', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', { title: 'Solo título' })
    expect(calls.update).toHaveBeenCalledWith('challenges', { title: 'Solo título' })
  })

  test('imagePath null quita la foto', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', { imagePath: null })
    expect(calls.update).toHaveBeenCalledWith('challenges', { image_path: null })
  })
})

describe('isPracticeChallenge', () => {
  test('un reto real (plazo a 48 h) NO es de práctica', () => {
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    expect(isPracticeChallenge(in48h)).toBe(false)
  })

  test('el infinito de práctica (año 2999) SÍ es de práctica', () => {
    expect(isPracticeChallenge('2999-12-31T23:59:59.999Z')).toBe(true)
  })

  test('un reto cerrado (plazo en el pasado) NO es de práctica', () => {
    expect(isPracticeChallenge('2020-01-01T00:00:00.000Z')).toBe(false)
  })
})
