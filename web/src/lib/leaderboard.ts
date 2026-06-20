import { supabase } from './supabase'
import type { Vote } from './database.types'

/** Voto enriquecido con el display_name del votante (join a profiles). La
 * identidad real es `user_id`; el nombre es solo para mostrar (puede repetirse). */
export interface VoteWithName extends Vote {
  display_name: string
}

export interface LeaderboardEntry {
  userId: string
  name: string
  points: number
  plays: number
}

/**
 * Clasificación general del grupo a partir de sus votos. SUMA de puntos por
 * `user_id` (no media): premiar participar engancha, así que jugar más retos
 * siempre puede subirte. Ordenado por puntos desc; a igualdad, por nombre asc
 * para que el orden sea estable. Función pura.
 *
 * Agrega por `user_id` (la identidad real); el `name` se toma del display_name
 * del primer voto visto de ese usuario.
 */
export function aggregateLeaderboard(votes: VoteWithName[]): LeaderboardEntry[] {
  const byUser = new Map<string, LeaderboardEntry>()
  for (const vote of votes) {
    const entry = byUser.get(vote.user_id)
    if (entry) {
      entry.points += vote.points
      entry.plays += 1
    } else {
      byUser.set(vote.user_id, {
        userId: vote.user_id,
        name: vote.display_name,
        points: vote.points,
        plays: 1,
      })
    }
  }
  return [...byUser.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}

// Forma de la fila del join votes → profiles que pide PostgREST.
interface VoteRow extends Vote {
  profiles: { display_name: string } | null
}

/**
 * Todos los votos de un grupo con el display_name del votante (join a profiles),
 * para alimentar `aggregateLeaderboard`. Si el perfil faltara (no debería),
 * cae a un guion para no romper la vista.
 */
export async function getGroupVotes(groupId: string): Promise<VoteWithName[]> {
  const { data, error } = await supabase
    .from('votes')
    .select('*, profiles ( display_name )')
    .eq('group_id', groupId)
  if (error) throw error
  const rows = (data ?? []) as unknown as VoteRow[]
  return rows.map(({ profiles, ...vote }) => ({
    ...vote,
    display_name: profiles?.display_name ?? '—',
  }))
}
