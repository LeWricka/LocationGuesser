import { describe, test, expect, vi } from 'vitest'
import type { VoteWithName } from './leaderboard'

// `aggregateLeaderboard` es pura, pero su módulo importa `./supabase`, que
// lanza si faltan las env vars. Mockeamos el cliente para aislar el test puro.
vi.mock('./supabase', () => ({ supabase: {} }))

import { aggregateLeaderboard } from './leaderboard'

// Helper para construir votos sin repetir los campos que no afectan al cálculo.
function vote(
  partial: Partial<VoteWithName> & { user_id: string; display_name: string; points: number },
): VoteWithName {
  return {
    id: crypto.randomUUID(),
    group_id: 'g1',
    challenge_id: 'c1',
    guess_lat: 0,
    guess_lng: 0,
    distance_km: 0,
    guess_number: null,
    abs_error: null,
    left_app: false,
    elapsed_seconds: null,
    play_started_at: null,
    created_at: '2026-06-19T00:00:00.000Z',
    avatar: null,
    ...partial,
  }
}

describe('aggregateLeaderboard', () => {
  test('lista vacía da clasificación vacía', () => {
    expect(aggregateLeaderboard([])).toEqual([])
  })

  test('suma puntos y cuenta jugadas por usuario', () => {
    const result = aggregateLeaderboard([
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 100, challenge_id: 'c1' }),
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 50, challenge_id: 'c2' }),
      vote({ user_id: 'u-bea', display_name: 'Bea', points: 120, challenge_id: 'c1' }),
    ])
    expect(result).toEqual([
      { userId: 'u-ana', name: 'Ana', avatar: null, points: 150, plays: 2 },
      { userId: 'u-bea', name: 'Bea', avatar: null, points: 120, plays: 1 },
    ])
  })

  test('toma el avatar del jugador (del primer voto visto)', () => {
    const result = aggregateLeaderboard([
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 10, avatar: 'emoji:🦊' }),
      vote({
        user_id: 'u-ana',
        display_name: 'Ana',
        points: 10,
        avatar: 'emoji:🐼',
        challenge_id: 'c2',
      }),
    ])
    expect(result[0].avatar).toBe('emoji:🦊')
  })

  test('ordena por puntos descendente (premia participar: suma, no media)', () => {
    // Bea tiene mejor media (120) pero Ana suma más jugando dos veces (150).
    const result = aggregateLeaderboard([
      vote({ user_id: 'u-bea', display_name: 'Bea', points: 120 }),
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 80, challenge_id: 'c1' }),
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 70, challenge_id: 'c2' }),
    ])
    expect(result.map((e) => e.name)).toEqual(['Ana', 'Bea'])
  })

  test('a igualdad de puntos, ordena por nombre (orden estable)', () => {
    const result = aggregateLeaderboard([
      vote({ user_id: 'u-zoe', display_name: 'Zoe', points: 100 }),
      vote({ user_id: 'u-ana', display_name: 'Ana', points: 100 }),
    ])
    expect(result.map((e) => e.name)).toEqual(['Ana', 'Zoe'])
  })

  test('agrega por user_id aunque dos usuarios compartan display_name', () => {
    // Dos "Lewis" distintos: la identidad real es user_id, no el nombre.
    const result = aggregateLeaderboard([
      vote({ user_id: 'u-1', display_name: 'Lewis', points: 100 }),
      vote({ user_id: 'u-2', display_name: 'Lewis', points: 80 }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.userId)).toEqual(['u-1', 'u-2'])
  })
})
