import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Challenge } from './database.types'

// Stub encadenable: solo cubrimos la ruta de `getChallenge`
// (`from('challenges').select().eq('id', id).single()`).
const calls = {
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}
let result: { data: unknown; error: unknown } = { data: null, error: null }

const builder = {
  select: (...args: unknown[]) => {
    calls.select(...args)
    return builder
  },
  eq: (...args: unknown[]) => {
    calls.eq(...args)
    return builder
  },
  single: () => Promise.resolve(result),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
  },
}))

import { getChallenge } from './challenges'

const sampleChallenge: Challenge = {
  id: 'c1',
  group_id: 'g1',
  title: 'Plaza Mayor',
  lat: 40.4155,
  lng: -3.7074,
  image_path: 'images/c1.jpg',
  guess_seconds: 120,
  deadline_at: '2026-06-19T23:59:59.999Z',
  created_by: 'Ana',
  created_at: '2026-06-19T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('getChallenge', () => {
  test('selecciona challenges filtrando por id y devuelve la fila', async () => {
    result = { data: sampleChallenge, error: null }
    const out = await getChallenge('c1')
    expect(calls.from).toHaveBeenCalledWith('challenges')
    expect(calls.eq).toHaveBeenCalledWith('id', 'c1')
    expect(out).toEqual(sampleChallenge)
  })

  test('propaga el error de Supabase (reto inexistente)', async () => {
    result = { data: null, error: new Error('no rows') }
    await expect(getChallenge('nope')).rejects.toThrow('no rows')
  })
})
