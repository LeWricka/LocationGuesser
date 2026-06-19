import { supabase } from './supabase'
import type { Vote } from './database.types'

export interface LeaderboardEntry {
  name: string
  points: number
  plays: number
}

/**
 * Clasificación general del viaje a partir de todos los votos del grupo.
 * SUMA de puntos por `player_name` (no media): premiar participar engancha,
 * así que jugar más retos siempre puede subirte. Ordenado por puntos desc;
 * a igualdad, por nombre asc para que el orden sea estable. Función pura.
 */
export function aggregateLeaderboard(votes: Vote[]): LeaderboardEntry[] {
  const byName = new Map<string, LeaderboardEntry>()
  for (const vote of votes) {
    const entry = byName.get(vote.player_name)
    if (entry) {
      entry.points += vote.points
      entry.plays += 1
    } else {
      byName.set(vote.player_name, { name: vote.player_name, points: vote.points, plays: 1 })
    }
  }
  return [...byName.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}

/** Todos los votos de un grupo, para alimentar `aggregateLeaderboard`. */
export async function getGroupVotes(groupId: string): Promise<Vote[]> {
  const { data, error } = await supabase.from('votes').select().eq('group_id', groupId)
  if (error) throw error
  return data ?? []
}
