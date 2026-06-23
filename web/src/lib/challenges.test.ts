import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Challenge } from './database.types'

// Stub encadenable por tabla. Cada método encadenable devuelve el builder; los
// terminales (`single`, `maybeSingle`) y la forma "thenable" resuelven con lo que
// fijemos en `results[table]`. `select` con `{ head: true }` devuelve `{ count }`.
const results: Record<string, { data?: unknown; error?: unknown; count?: number }> = {}
const calls = {
  from: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
}

function builderFor(table: string) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = (...args: unknown[]) => {
    calls.eq(...args)
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

import { getChallenge, countVotes, updateChallenge } from './challenges'

const sampleChallenge: Challenge = {
  id: 'c1',
  group_id: 'g1',
  title: 'Plaza Mayor',
  lat: 40.4155,
  lng: -3.7074,
  image_path: null,
  sv_pano_id: 'PANO123',
  sv_heading: 0,
  sv_pitch: 0,
  guess_seconds: 120,
  deadline_at: '2026-06-19T23:59:59.999Z',
  photo_is_hint: true,
  created_by: '00000000-0000-0000-0000-000000000001',
  created_at: '2026-06-19T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(results)) delete results[k]
})

describe('getChallenge', () => {
  test('selecciona challenges filtrando por id y devuelve la fila', async () => {
    results['challenges'] = { data: sampleChallenge, error: null }
    const out = await getChallenge('c1')
    expect(calls.from).toHaveBeenCalledWith('challenges')
    expect(calls.eq).toHaveBeenCalledWith('id', 'c1')
    expect(out).toEqual(sampleChallenge)
  })

  test('propaga el error de Supabase (reto inexistente)', async () => {
    results['challenges'] = { data: null, error: new Error('no rows') }
    await expect(getChallenge('nope')).rejects.toThrow('no rows')
  })
})

describe('countVotes', () => {
  test('devuelve el count exacto de votos del reto', async () => {
    results['votes'] = { error: null, count: 3 }
    expect(await countVotes('c1')).toBe(3)
    expect(calls.eq).toHaveBeenCalledWith('challenge_id', 'c1')
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
    expect(out.title).toBe('Nuevo')
  })

  test('permite cambiar la ubicación si el reto no tiene votos', async () => {
    results['votes'] = { error: null, count: 0 }
    results['challenges'] = { data: sampleChallenge, error: null }
    await updateChallenge('c1', {
      location: { lat: 1, lng: 2, svPanoId: 'P', svHeading: 10, svPitch: 5 },
    })
    expect(calls.update).toHaveBeenCalledWith('challenges', {
      lat: 1,
      lng: 2,
      sv_pano_id: 'P',
      sv_heading: 10,
      sv_pitch: 5,
    })
  })

  test('RECHAZA cambiar la ubicación si el reto ya tiene votos', async () => {
    results['votes'] = { error: null, count: 2 }
    await expect(updateChallenge('c1', { location: { lat: 1, lng: 2 } })).rejects.toThrow(
      /ubicación/,
    )
    // No debe llegar a hacer el update de challenges.
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
