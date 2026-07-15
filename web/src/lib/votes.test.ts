import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Vote } from './database.types'

// Stub encadenable del query builder de Supabase (para getExistingVote/getVotes) +
// stub de `rpc` (para submitVote). Cada método encadenable devuelve el builder; los
// terminales (single/maybeSingle) y la forma thenable resuelven con `result`.
const calls = {
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
}
// Resultado por tabla: getVotesWithNames consulta `votes` y luego `profiles`, así
// que distinguimos qué devuelve cada una en una misma prueba (`byTable`). Las demás
// pruebas usan `result` (resultado único) como antes.
const byTable: Record<string, { data: unknown; error: unknown }> = {}
let result: { data: unknown; error: unknown } = { data: null, error: null }
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }

function builderFor(table: string) {
  const resolved = () => byTable[table] ?? result
  const b: Record<string, unknown> = {}
  b.select = (...args: unknown[]) => {
    calls.select(...args)
    return b
  }
  b.eq = (...args: unknown[]) => {
    calls.eq(...args)
    return b
  }
  b.in = (...args: unknown[]) => {
    calls.in(...args)
    return b
  }
  b.delete = (...args: unknown[]) => {
    calls.delete(...args)
    return b
  }
  b.single = () => Promise.resolve(resolved())
  b.maybeSingle = () => Promise.resolve(resolved())
  b.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => resolve(resolved())
  return b
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builderFor(table)
    },
    rpc: (name: string, args: unknown) => {
      calls.rpc(name, args)
      return Promise.resolve(rpcResult)
    },
  },
}))

import {
  submitVote,
  submitNumberVote,
  getExistingVote,
  getVotes,
  getVotesWithNames,
  deleteMyVote,
  startPlay,
} from './votes'
import { ResourceGoneError } from './errors'

const sampleVote: Vote = {
  id: 'v1',
  group_id: 'g1',
  challenge_id: 'c1',
  user_id: 'u-ana',
  guess_lat: 40,
  guess_lng: -3,
  distance_km: 12.3,
  guess_number: null,
  abs_error: null,
  points: 4900,
  left_app: false,
  elapsed_seconds: null,
  play_started_at: null,
  created_at: '2026-06-19T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
  rpcResult = { data: null, error: null }
  for (const k of Object.keys(byTable)) delete byTable[k]
})

describe('submitVote', () => {
  test('llama a la RPC submit_vote con la adivinanza (no calcula puntos en cliente)', async () => {
    rpcResult = {
      data: [
        { distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1, speed_factor: 1 },
      ],
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
    expect(out).toEqual({
      distanceKm: 12.3,
      points: 4900,
      answerLat: 40.1,
      answerLng: -3.1,
      speedFactor: 1,
    })
  })

  // Issue #628: la velocidad puntúa — el cliente lee el factor REALMENTE
  // aplicado por el servidor (nunca lo calcula ni lo pide).
  test('propaga el speed_factor del servidor tal cual (autoridad de servidor, #628)', async () => {
    rpcResult = {
      data: [
        {
          distance_km: 12.3,
          points: 4410,
          answer_lat: 40.1,
          answer_lng: -3.1,
          speed_factor: 0.9,
        },
      ],
      error: null,
    }
    const out = await submitVote({ challengeId: 'c1', guessLat: 40, guessLng: -3 })
    expect(out.speedFactor).toBe(0.9)
  })

  test('voto de timeout: manda lat/lng null y no recibe respuesta', async () => {
    rpcResult = {
      data: [{ distance_km: null, points: 0, answer_lat: null, answer_lng: null, speed_factor: 1 }],
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
    expect(out).toEqual({
      distanceKm: null,
      points: 0,
      answerLat: null,
      answerLng: null,
      speedFactor: 1,
    })
  })

  test('pasa leftApp=true como p_left_app cuando el jugador salió de la app', async () => {
    rpcResult = {
      data: [
        { distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1, speed_factor: 1 },
      ],
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
      data: [
        { distance_km: 12.3, points: 4900, answer_lat: 40.1, answer_lng: -3.1, speed_factor: 1 },
      ],
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

  // Issue #760 (LOCATIONGUESSER-10, caso real): el reto se borró con la pantalla
  // de jugar ya abierta — P0002 de la RPC. Debe distinguirse de un error genérico
  // (por CÓDIGO, no por texto) para que el llamador muestre un estado amable.
  test('P0002 (reto borrado): lanza ResourceGoneError, no un Error genérico', async () => {
    rpcResult = { data: null, error: { code: 'P0002', message: 'Reto no encontrado' } }
    await expect(submitVote({ challengeId: 'c1', guessLat: 0, guessLng: 0 })).rejects.toThrow(
      ResourceGoneError,
    )
  })
})

describe('submitNumberVote', () => {
  test('llama a la RPC submit_number_vote con la cifra (no calcula puntos en cliente)', async () => {
    rpcResult = {
      data: [{ abs_error: 12.5, rel_error: 0.148, points: 1980, answer_number: 84.5 }],
      error: null,
    }
    const out = await submitNumberVote({ challengeId: 'n1', guess: 72 })
    expect(calls.rpc).toHaveBeenCalledWith('submit_number_vote', {
      p_challenge_id: 'n1',
      p_guess: 72,
      p_left_app: false,
      p_elapsed_seconds: null,
    })
    expect(out).toEqual({ absError: 12.5, relError: 0.148, points: 1980, answerNumber: 84.5 })
  })

  test('voto de timeout: manda guess null y no recibe cifra', async () => {
    rpcResult = {
      data: [{ abs_error: null, rel_error: null, points: 0, answer_number: null }],
      error: null,
    }
    const out = await submitNumberVote({ challengeId: 'n1', guess: null })
    expect(calls.rpc).toHaveBeenCalledWith('submit_number_vote', {
      p_challenge_id: 'n1',
      p_guess: null,
      p_left_app: false,
      p_elapsed_seconds: null,
    })
    expect(out).toEqual({ absError: null, relError: null, points: 0, answerNumber: null })
  })

  test('propaga leftApp y elapsedSeconds a la RPC', async () => {
    rpcResult = {
      data: [{ abs_error: 0, rel_error: 0, points: 5000, answer_number: 100 }],
      error: null,
    }
    await submitNumberVote({ challengeId: 'n1', guess: 100, leftApp: true, elapsedSeconds: 9 })
    expect(calls.rpc).toHaveBeenCalledWith('submit_number_vote', {
      p_challenge_id: 'n1',
      p_guess: 100,
      p_left_app: true,
      p_elapsed_seconds: 9,
    })
  })

  test('propaga el error de la RPC', async () => {
    rpcResult = { data: null, error: new Error('boom') }
    await expect(submitNumberVote({ challengeId: 'n1', guess: 1 })).rejects.toThrow('boom')
  })

  // Issue #760: HERMANA del caso de submitVote — mismo código P0002, mismo trato.
  test('P0002 (reto borrado): lanza ResourceGoneError, no un Error genérico', async () => {
    rpcResult = { data: null, error: { code: 'P0002', message: 'Reto no encontrado' } }
    await expect(submitNumberVote({ challengeId: 'n1', guess: 1 })).rejects.toThrow(
      ResourceGoneError,
    )
  })
})

describe('getVotesWithNames', () => {
  test('une votos con display_name/avatar del perfil', async () => {
    byTable['votes'] = {
      data: [{ ...sampleVote, user_id: 'u-ana' }],
      error: null,
    }
    byTable['profiles'] = {
      data: [{ id: 'u-ana', display_name: 'Ana', avatar_url: 'emoji:🦊' }],
      error: null,
    }
    const out = await getVotesWithNames('c1')
    expect(calls.from).toHaveBeenCalledWith('votes')
    expect(calls.from).toHaveBeenCalledWith('profiles')
    expect(calls.in).toHaveBeenCalledWith('id', ['u-ana'])
    expect(out).toHaveLength(1)
    expect(out[0].display_name).toBe('Ana')
    expect(out[0].avatar).toBe('emoji:🦊')
  })

  test('sin votos no consulta perfiles y devuelve []', async () => {
    byTable['votes'] = { data: [], error: null }
    const out = await getVotesWithNames('c1')
    expect(out).toEqual([])
    expect(calls.from).not.toHaveBeenCalledWith('profiles')
  })

  test('perfil ausente cae a guion / sin avatar', async () => {
    byTable['votes'] = { data: [{ ...sampleVote, user_id: 'u-x' }], error: null }
    byTable['profiles'] = { data: [], error: null }
    const out = await getVotesWithNames('c1')
    expect(out[0].display_name).toBe('—')
    expect(out[0].avatar).toBeNull()
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

// Issue #628: registra el arranque server-side ANTES de que corra el reloj.
describe('startPlay', () => {
  test('llama a la RPC start_play con el id del reto', async () => {
    rpcResult = { data: null, error: null }
    await startPlay('c1')
    expect(calls.rpc).toHaveBeenCalledWith('start_play', { p_challenge_id: 'c1' })
  })

  test('propaga el error de la RPC (el llamador decide el best-effort)', async () => {
    rpcResult = { data: null, error: new Error('boom') }
    await expect(startPlay('c1')).rejects.toThrow('boom')
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
