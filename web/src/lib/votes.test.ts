import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Vote } from './database.types'

// Stub encadenable del query builder de Supabase (para getExistingVote/getVotes) +
// stub de `rpc` (para submitVote). Cada método encadenable devuelve el builder; los
// terminales (single/maybeSingle) y la forma thenable resuelven con `result`.
const calls = {
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
}
let result: { data: unknown; error: unknown } = { data: null, error: null }
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }

const builder = {
  select: (...args: unknown[]) => {
    calls.select(...args)
    return builder
  },
  eq: (...args: unknown[]) => {
    calls.eq(...args)
    return builder
  },
  delete: (...args: unknown[]) => {
    calls.delete(...args)
    return builder
  },
  single: () => Promise.resolve(result),
  maybeSingle: () => Promise.resolve(result),
  then: (resolve: (r: typeof result) => unknown) => resolve(result),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
    rpc: (name: string, args: unknown) => {
      calls.rpc(name, args)
      return Promise.resolve(rpcResult)
    },
  },
}))

import { submitVote, getExistingVote, getVotes, deleteMyVote } from './votes'

const sampleVote: Vote = {
  id: 'v1',
  group_id: 'g1',
  challenge_id: 'c1',
  user_id: 'u-ana',
  guess_lat: 40,
  guess_lng: -3,
  distance_km: 12.3,
  points: 4900,
  left_app: false,
  elapsed_seconds: null,
  created_at: '2026-06-19T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
  rpcResult = { data: null, error: null }
})

describe('submitVote', () => {
  test('llama a la RPC submit_vote con la adivinanza (no calcula puntos en cliente)', async () => {
    rpcResult = {
      data: [{ distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1 }],
      error: null,
    }
    const out = await submitVote({ challengeId: 'c1', guessLat: 40, guessLng: -3 })
    expect(calls.rpc).toHaveBeenCalledWith('submit_vote', {
      p_challenge_id: 'c1',
      p_lat: 40,
      p_lng: -3,
      // Sin pasar leftApp → la RPC recibe false (su default).
      p_left_app: false,
      // Sin pasar elapsedSeconds → null (la RPC usa su default).
      p_elapsed_seconds: null,
    })
    // El cliente NO manda points: el servidor los devuelve y el cliente los usa tal cual.
    expect(out).toEqual({ distanceKm: 12.3, points: 4900, answerLat: 40.1, answerLng: -3.1 })
  })

  test('voto de timeout: manda lat/lng null y no recibe respuesta', async () => {
    rpcResult = {
      data: [{ distance_km: null, points: 0, answer_lat: null, answer_lng: null }],
      error: null,
    }
    const out = await submitVote({ challengeId: 'c1', guessLat: null, guessLng: null })
    expect(calls.rpc).toHaveBeenCalledWith('submit_vote', {
      p_challenge_id: 'c1',
      p_lat: null,
      p_lng: null,
      p_left_app: false,
      p_elapsed_seconds: null,
    })
    expect(out).toEqual({ distanceKm: null, points: 0, answerLat: null, answerLng: null })
  })

  test('pasa leftApp=true como p_left_app cuando el jugador salió de la app', async () => {
    rpcResult = {
      data: [{ distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1 }],
      error: null,
    }
    await submitVote({ challengeId: 'c1', guessLat: 40, guessLng: -3, leftApp: true })
    expect(calls.rpc).toHaveBeenCalledWith('submit_vote', {
      p_challenge_id: 'c1',
      p_lat: 40,
      p_lng: -3,
      p_left_app: true,
      p_elapsed_seconds: null,
    })
  })

  test('pasa elapsedSeconds como p_elapsed_seconds (tiempo de respuesta, #214)', async () => {
    rpcResult = {
      data: [{ distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1 }],
      error: null,
    }
    await submitVote({ challengeId: 'c1', guessLat: 40, guessLng: -3, elapsedSeconds: 37 })
    expect(calls.rpc).toHaveBeenCalledWith('submit_vote', {
      p_challenge_id: 'c1',
      p_lat: 40,
      p_lng: -3,
      p_left_app: false,
      p_elapsed_seconds: 37,
    })
  })

  test('propaga el error de la RPC', async () => {
    rpcResult = { data: null, error: new Error('boom') }
    await expect(submitVote({ challengeId: 'c1', guessLat: 0, guessLng: 0 })).rejects.toThrow(
      'boom',
    )
  })

  test('lanza si la RPC no devuelve ninguna fila', async () => {
    rpcResult = { data: [], error: null }
    await expect(submitVote({ challengeId: 'c1', guessLat: 0, guessLng: 0 })).rejects.toThrow(
      /no devolvió/,
    )
  })
})

describe('getExistingVote', () => {
  test('filtra por challenge_id y user_id y devuelve la fila', async () => {
    result = { data: sampleVote, error: null }
    const out = await getExistingVote('c1', 'u-ana')
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.eq).toHaveBeenCalledWith('challenge_id', 'c1')
    expect(calls.eq).toHaveBeenCalledWith('user_id', 'u-ana')
    expect(out).toEqual(sampleVote)
  })

  test('devuelve null si el usuario no ha votado', async () => {
    result = { data: null, error: null }
    expect(await getExistingVote('c1', 'u-nadie')).toBeNull()
  })

  test('propaga el error', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(getExistingVote('c1', 'u-ana')).rejects.toThrow('boom')
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

describe('deleteMyVote', () => {
  test('borra filtrando por challenge_id (la RLS limita al propio usuario)', async () => {
    result = { data: null, error: null }
    await deleteMyVote('c1')
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.delete).toHaveBeenCalled()
    expect(calls.eq).toHaveBeenCalledWith('challenge_id', 'c1')
  })

  test('propaga el error de Supabase', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(deleteMyVote('c1')).rejects.toThrow('boom')
  })
})
