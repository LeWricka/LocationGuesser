import { describe, test, expect, vi } from 'vitest'
import type { Vote } from './database.types'

// `aggregateLeaderboard` es pura, pero su módulo importa `./supabase`, que
// lanza si faltan las env vars. Mockeamos el cliente para aislar el test puro.
vi.mock('./supabase', () => ({ supabase: {} }))

import { aggregateLeaderboard } from './leaderboard'

// Helper para construir votos sin repetir los campos que no afectan al cálculo.
function vote(partial: Partial<Vote> & { player_name: string; points: number }): Vote {
  return {
    id: crypto.randomUUID(),
    group_id: 'g1',
    challenge_id: 'c1',
    guess_lat: 0,
    guess_lng: 0,
    distance_km: 0,
    created_at: '2026-06-19T00:00:00.000Z',
    ...partial,
  }
}

describe('aggregateLeaderboard', () => {
  test('lista vacía da clasificación vacía', () => {
    expect(aggregateLeaderboard([])).toEqual([])
  })

  test('suma puntos y cuenta jugadas por jugador', () => {
    const result = aggregateLeaderboard([
      vote({ player_name: 'Ana', points: 100, challenge_id: 'c1' }),
      vote({ player_name: 'Ana', points: 50, challenge_id: 'c2' }),
      vote({ player_name: 'Bea', points: 120, challenge_id: 'c1' }),
    ])
    expect(result).toEqual([
      { name: 'Ana', points: 150, plays: 2 },
      { name: 'Bea', points: 120, plays: 1 },
    ])
  })

  test('ordena por puntos descendente (premia participar: suma, no media)', () => {
    // Bea tiene mejor media (120) pero Ana suma más jugando dos veces (150).
    const result = aggregateLeaderboard([
      vote({ player_name: 'Bea', points: 120 }),
      vote({ player_name: 'Ana', points: 80, challenge_id: 'c1' }),
      vote({ player_name: 'Ana', points: 70, challenge_id: 'c2' }),
    ])
    expect(result.map((e) => e.name)).toEqual(['Ana', 'Bea'])
  })

  test('a igualdad de puntos, ordena por nombre (orden estable)', () => {
    const result = aggregateLeaderboard([
      vote({ player_name: 'Zoe', points: 100 }),
      vote({ player_name: 'Ana', points: 100 }),
    ])
    expect(result.map((e) => e.name)).toEqual(['Ana', 'Zoe'])
  })
})
