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
  createNumberChallenge,
  createMoment,
  promoteToChallenge,
  getChallenge,
  getAnswer,
  getNumberAnswer,
  getAnswers,
  countVotes,
  updateChallenge,
  updateMoment,
  isPracticeChallenge,
} from './challenges'

const sampleChallenge: Challenge = {
  id: 'c1',
  group_id: 'g1',
  title: 'Plaza Mayor',
  description: null,
  is_challenge: true,
  lat: 40.4155,
  lng: -3.7074,
  place_lat: null,
  place_lng: null,
  image_path: null,
  audio_path: null,
  sv_pano_id: 'PANO123',
  sv_heading: 0,
  sv_pitch: 0,
  guess_seconds: 120,
  deadline_at: '2026-06-19T23:59:59.999Z',
  photo_is_hint: true,
  sv_lock_move: false,
  sv_lock_rotate: false,
  score_scale: 'mundo',
  challenge_kind: 'location',
  number_question: null,
  number_unit: null,
  number_decimals: 0,
  number_tolerance: 'normal',
  time_scoring: true,
  created_by: '00000000-0000-0000-0000-000000000001',
  created_at: '2026-06-19T10:00:00.000Z',
}

// Un RECUERDO: sin reto, lugar visible en place_*, sin respuesta oculta ni plazo.
const sampleMoment: Challenge = {
  ...sampleChallenge,
  id: 'm1',
  title: 'Cena en el puerto',
  is_challenge: false,
  place_lat: 43.32,
  place_lng: -1.98,
  deadline_at: null,
  guess_seconds: null,
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

  test('la precisión por defecto es "mundo" (scoring histórico)', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await createChallenge({ title: 'x', lat: 1, lng: 2, createdBy: 'u', groupId: 'g1' })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.score_scale).toBe('mundo')
  })

  test('escribe la precisión elegida (score_scale) cuando se pasa', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await createChallenge({
      title: 'x',
      lat: 1,
      lng: 2,
      createdBy: 'u',
      groupId: 'g1',
      scoreScale: 'ciudad',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.score_scale).toBe('ciudad')
  })

  // Issue #628: la velocidad puntúa, activada por defecto.
  test('time_scoring por defecto es true (la velocidad puntúa, activada)', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await createChallenge({ title: 'x', lat: 1, lng: 2, createdBy: 'u', groupId: 'g1' })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.time_scoring).toBe(true)
  })

  test('escribe time_scoring=false cuando el creador lo apaga', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await createChallenge({
      title: 'x',
      lat: 1,
      lng: 2,
      createdBy: 'u',
      groupId: 'g1',
      timeScoring: false,
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.time_scoring).toBe(false)
  })

  test('SOLO FOTO (sin Street View): sv_pano_id/heading/pitch quedan a null', async () => {
    // El camino que SIEMPRE debe funcionar aunque Street View no cargue: un reto
    // con foto y sin panorama. Sin svPanoId, los sv_* van a null y se inserta igual.
    results['challenges'] = { data: sampleChallenge, error: null }
    await createChallenge({
      title: 'Solo foto',
      lat: 1,
      lng: 2,
      createdBy: 'u',
      groupId: 'g1',
      imagePath: 'grupo/foto.jpg',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.sv_pano_id).toBeNull()
    expect(insertArg.sv_heading).toBeNull()
    expect(insertArg.sv_pitch).toBeNull()
    expect(insertArg.image_path).toBe('grupo/foto.jpg')
  })

  test('propaga el error de permiso (RLS 42501) para que la UI lo muestre', async () => {
    // Si el INSERT choca con la RLS (p.ej. no-miembro), createChallenge NO lo traga:
    // lanza para que `save()` muestre el toast de error en vez de fingir éxito.
    results['challenges'] = {
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    }
    await expect(
      createChallenge({ title: 'x', lat: 1, lng: 2, createdBy: 'u', groupId: 'g1' }),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('createNumberChallenge', () => {
  const numberChallenge: Challenge = {
    ...sampleChallenge,
    id: 'n1',
    title: 'La porra de la cena',
    challenge_kind: 'number',
    number_question: '¿Cuánto creéis que nos costó?',
    number_unit: '€',
    number_decimals: 2,
    number_tolerance: 'estricto',
    sv_pano_id: null,
  }

  test('escribe la cifra en answer_number_src (NUNCA en una columna legible) y los number_*', async () => {
    results['challenges'] = { data: numberChallenge, error: null }
    const out = await createNumberChallenge({
      title: 'La porra de la cena',
      question: '¿Cuánto creéis que nos costó?',
      answerNumber: 84.5,
      decimals: 2,
      unit: '€',
      tolerance: 'estricto',
      createdBy: 'u',
      groupId: 'g1',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    // La cifra correcta entra por answer_number_src (spoiler, write-only).
    expect(insertArg.answer_number_src).toBe(84.5)
    expect(insertArg.challenge_kind).toBe('number')
    expect(insertArg.number_question).toBe('¿Cuánto creéis que nos costó?')
    expect(insertArg.number_unit).toBe('€')
    expect(insertArg.number_decimals).toBe(2)
    expect(insertArg.number_tolerance).toBe('estricto')
    // No hay lat/lng en un reto de número (no se setea la respuesta de lugar).
    expect('lat' in insertArg).toBe(false)
    expect('lng' in insertArg).toBe(false)
    // El cliente NO escribe challenge_answers: lo hace el trigger 0029.
    const wroteAnswer =
      calls.upsert.mock.calls.some((c) => c[0] === 'challenge_answers') ||
      calls.insert.mock.calls.some((c) => c[0] === 'challenge_answers')
    expect(wroteAnswer).toBe(false)
    // El RETURNING no expone la cifra (CHALLENGE_COLUMNS_NO_ANSWER, sin answer_number_src).
    const selectArg = calls.select.mock.calls.find((c) => c[0] === 'challenges')?.[1] as string
    expect(selectArg).not.toMatch(/answer_number/)
    expect(out.challenge).toEqual(numberChallenge)
  })

  test('unidad vacía/espacios → null; decimales y tolerancia por defecto', async () => {
    results['challenges'] = { data: numberChallenge, error: null }
    await createNumberChallenge({
      title: 'x',
      question: '¿Cuántos?',
      answerNumber: 10,
      unit: '   ',
      createdBy: 'u',
      groupId: 'g1',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.number_unit).toBeNull()
    expect(insertArg.number_decimals).toBe(0)
    expect(insertArg.number_tolerance).toBe('normal')
  })
})

describe('getNumberAnswer', () => {
  test('lee answer_number de challenge_answers (RLS decide si la sirve)', async () => {
    results['challenge_answers'] = { data: { answer_number: 84.5 }, error: null }
    const out = await getNumberAnswer('n1')
    expect(calls.from).toHaveBeenCalledWith('challenge_answers')
    expect(calls.eq).toHaveBeenCalledWith('challenge_answers', 'challenge_id', 'n1')
    expect(out).toBe(84.5)
  })

  test('devuelve null si el usuario aún no tiene derecho (sin fila)', async () => {
    results['challenge_answers'] = { data: null, error: null }
    expect(await getNumberAnswer('n1')).toBeNull()
  })
})

describe('createMoment', () => {
  test('inserta un recuerdo: is_challenge=false, sin respuesta oculta ni plazo', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    const out = await createMoment({
      title: 'Cena en el puerto',
      createdBy: 'u',
      groupId: 'g1',
      placeLat: 43.32,
      placeLng: -1.98,
      description: 'Qué cena',
    })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.is_challenge).toBe(false)
    // Lugar VISIBLE en place_*; NO setea lat/lng (sin respuesta oculta → el trigger
    // no crea fila en challenge_answers).
    expect(insertArg.place_lat).toBe(43.32)
    expect(insertArg.place_lng).toBe(-1.98)
    expect('lat' in insertArg).toBe(false)
    expect('lng' in insertArg).toBe(false)
    // Un recuerdo no caduca.
    expect(insertArg.deadline_at).toBeNull()
    // El cliente NO escribe la respuesta.
    const wroteAnswer =
      calls.upsert.mock.calls.some((c) => c[0] === 'challenge_answers') ||
      calls.insert.mock.calls.some((c) => c[0] === 'challenge_answers')
    expect(wroteAnswer).toBe(false)
    expect(out.challenge).toEqual(sampleMoment)
    expect(out.groupId).toBe('g1')
  })

  test('un recuerdo sin lugar es válido (place_* a null)', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await createMoment({ title: 'Solo foto', createdBy: 'u', groupId: 'g1' })
    const insertArg = calls.insert.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(insertArg.place_lat).toBeNull()
    expect(insertArg.place_lng).toBeNull()
  })
})

describe('promoteToChallenge', () => {
  test('convierte un recuerdo en reto: is_challenge=true + respuesta + plazo; la respuesta la espeja el trigger', async () => {
    results['challenges'] = { data: { ...sampleChallenge, id: 'm1' }, error: null }
    await promoteToChallenge('m1', {
      lat: 43.32,
      lng: -1.98,
      deadlineAt: '2026-07-01T00:00:00.000Z',
      guessSeconds: 60,
      svLockMove: true,
    })
    const updateArg = calls.update.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(updateArg.is_challenge).toBe(true)
    expect(updateArg.lat).toBe(43.32)
    expect(updateArg.lng).toBe(-1.98)
    expect(updateArg.deadline_at).toBe('2026-07-01T00:00:00.000Z')
    expect(updateArg.guess_seconds).toBe(60)
    expect(updateArg.sv_lock_move).toBe(true)
    expect(updateArg.sv_lock_rotate).toBe(false)
    expect(calls.eq).toHaveBeenCalledWith('challenges', 'id', 'm1')
    // El cliente NO escribe challenge_answers: lo hace el trigger 0022.
    const wroteAnswer = calls.upsert.mock.calls.some((c) => c[0] === 'challenge_answers')
    expect(wroteAnswer).toBe(false)
  })

  test('sin plazo explícito cae al default (24 h desde ahora, futuro)', async () => {
    results['challenges'] = { data: { ...sampleChallenge, id: 'm1' }, error: null }
    await promoteToChallenge('m1', { lat: 1, lng: 2 })
    const updateArg = calls.update.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(new Date(updateArg.deadline_at as string).getTime()).toBeGreaterThan(Date.now())
  })

  test('promociona con la precisión por defecto "mundo" si no se elige', async () => {
    results['challenges'] = { data: { ...sampleChallenge, id: 'm1' }, error: null }
    await promoteToChallenge('m1', { lat: 1, lng: 2 })
    const updateArg = calls.update.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(updateArg.score_scale).toBe('mundo')
  })

  test('promociona escribiendo la precisión elegida (barrio)', async () => {
    results['challenges'] = { data: { ...sampleChallenge, id: 'm1' }, error: null }
    await promoteToChallenge('m1', { lat: 1, lng: 2, scoreScale: 'barrio' })
    const updateArg = calls.update.mock.calls.find((c) => c[0] === 'challenges')?.[1] as Record<
      string,
      unknown
    >
    expect(updateArg.score_scale).toBe('barrio')
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

  test('la ESCENA (Street View) se puede añadir AUNQUE el reto tenga votos', async () => {
    // Con votos, la ubicación está bloqueada; la escena (sv_*) SÍ se permite porque
    // no toca lat/lng (no revela ni altera la respuesta ni los puntos).
    results['votes'] = { error: null, count: 5 }
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', { scene: { svPanoId: 'NEW_PANO', svHeading: 90, svPitch: -5 } })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      sv_pano_id: 'NEW_PANO',
      sv_heading: 90,
      sv_pitch: -5,
    })
    // No comprueba votos ni toca lat/lng: la escena no es la respuesta.
    const patch = calls.update.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('lat')
    expect(patch).not.toHaveProperty('lng')
  })

  test('scene null quita el Street View sin tocar la respuesta', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', { scene: null })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      sv_pano_id: null,
      sv_heading: null,
      sv_pitch: null,
    })
    const patch = calls.update.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('lat')
  })
})

describe('updateMoment', () => {
  test('edita título y fecha del recuerdo (created_at)', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await updateMoment('m1', { title: 'Nuevo título', createdAt: '2026-04-08T10:00:00.000Z' })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      title: 'Nuevo título',
      created_at: '2026-04-08T10:00:00.000Z',
    })
  })

  test('descripción vacía se guarda como null', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await updateMoment('m1', { description: '   ' })
    expect(calls.update).toHaveBeenCalledWith('challenges', { description: null })
  })

  test('cambiar el lugar escribe place_* (no lat/lng: el lugar es visible)', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await updateMoment('m1', { place: { lat: 1, lng: 2 } })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      place_lat: 1,
      place_lng: 2,
      sv_pano_id: null,
      sv_heading: null,
      sv_pitch: null,
    })
    // No toca la respuesta oculta (lat/lng): un recuerdo no tiene respuesta.
    const patch = calls.update.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(patch).not.toHaveProperty('lat')
    expect(patch).not.toHaveProperty('lng')
  })

  test('place null quita el lugar y el panorama del recuerdo', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await updateMoment('m1', { place: null })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      place_lat: null,
      place_lng: null,
      sv_pano_id: null,
      sv_heading: null,
      sv_pitch: null,
    })
  })

  test('sin campos presentes no manda nada espurio (patch vacío)', async () => {
    results['challenges'] = { data: sampleMoment, error: null }
    await updateMoment('m1', {})
    expect(calls.update).toHaveBeenCalledWith('challenges', {})
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
