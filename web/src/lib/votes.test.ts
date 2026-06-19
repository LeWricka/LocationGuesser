import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Vote } from './database.types'

// Stub encadenable del query builder de Supabase. Cada método devuelve `this`
// para poder hacer `.select().eq().eq().maybeSingle()`; la cadena se resuelve
// con el `result` que fijemos en cada test. Registramos las llamadas para
// verificar que se construye la consulta correcta (tabla, filtros, onConflict).
const calls = {
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}
let result: { data: unknown; error: unknown } = { data: null, error: null }

const builder = {
  upsert: (...args: unknown[]) => {
    calls.upsert(...args)
    return builder
  },
  select: (...args: unknown[]) => {
    calls.select(...args)
    return builder
  },
  eq: (...args: unknown[]) => {
    calls.eq(...args)
    return builder
  },
  single: () => Promise.resolve(result),
  maybeSingle: () => Promise.resolve(result),
  // `getVotes` no termina en single/maybeSingle: resuelve la propia cadena.
  then: (resolve: (r: typeof result) => unknown) => resolve(result),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
  },
}))

import { saveVote, getExistingVote, getVotes } from './votes'

const sampleVote: Vote = {
  id: 'v1',
  group_id: 'g1',
  challenge_id: 'c1',
  player_name: 'Ana',
  guess_lat: 40,
  guess_lng: -3,
  distance_km: 12.3,
  points: 4900,
  created_at: '2026-06-19T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('saveVote', () => {
  test('hace upsert con onConflict (challenge_id,player_name) y mapea la fila', async () => {
    result = { data: sampleVote, error: null }
    const out = await saveVote({
      groupId: 'g1',
      challengeId: 'c1',
      playerName: 'Ana',
      guessLat: 40,
      guessLng: -3,
      distanceKm: 12.3,
      points: 4900,
    })
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.upsert).toHaveBeenCalledWith(
      {
        group_id: 'g1',
        challenge_id: 'c1',
        player_name: 'Ana',
        guess_lat: 40,
        guess_lng: -3,
        distance_km: 12.3,
        points: 4900,
      },
      { onConflict: 'challenge_id,player_name' },
    )
    expect(out).toEqual(sampleVote)
  })

  test('propaga el error de Supabase', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(
      saveVote({
        groupId: 'g1',
        challengeId: 'c1',
        playerName: 'Ana',
        guessLat: 0,
        guessLng: 0,
        distanceKm: 0,
        points: 0,
      }),
    ).rejects.toThrow('boom')
  })
})

describe('getExistingVote', () => {
  test('filtra por challenge_id y player_name y devuelve la fila', async () => {
    result = { data: sampleVote, error: null }
    const out = await getExistingVote('c1', 'Ana')
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.eq).toHaveBeenCalledWith('challenge_id', 'c1')
    expect(calls.eq).toHaveBeenCalledWith('player_name', 'Ana')
    expect(out).toEqual(sampleVote)
  })

  test('devuelve null si el jugador no ha votado', async () => {
    result = { data: null, error: null }
    expect(await getExistingVote('c1', 'Nadie')).toBeNull()
  })

  test('propaga el error', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(getExistingVote('c1', 'Ana')).rejects.toThrow('boom')
  })
})

describe('getVotes', () => {
  test('filtra por challenge_id y devuelve el array', async () => {
    result = { data: [sampleVote], error: null }
    const out = await getVotes('c1')
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.eq).toHaveBeenCalledWith('challenge_id', 'c1')
    expect(out).toEqual([sampleVote])
  })

  test('devuelve [] cuando data es null', async () => {
    result = { data: null, error: null }
    expect(await getVotes('c1')).toEqual([])
  })

  test('propaga el error', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(getVotes('c1')).rejects.toThrow('boom')
  })
})
