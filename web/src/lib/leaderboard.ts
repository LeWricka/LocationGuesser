import { supabase } from './supabase'
import type { Vote } from './database.types'

/** Voto enriquecido con datos de display del votante (join a profiles). La
 * identidad real es `user_id`; el nombre es solo para mostrar (puede repetirse).
 * `avatar` es el `avatar_url` del perfil (token `emoji:…`, URL o null). */
export interface VoteWithName extends Vote {
  display_name: string
  avatar: string | null
}

export interface LeaderboardEntry {
  userId: string
  name: string
  avatar: string | null
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
        avatar: vote.avatar,
        points: vote.points,
        plays: 1,
      })
    }
  }
  return [...byUser.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}

/**
 * Todos los votos de un grupo con el display_name del votante, para alimentar
 * `aggregateLeaderboard`. En dos consultas (votos + perfiles) en vez de un embed
 * de PostgREST: `votes.user_id` referencia `auth.users`, no `public.profiles`,
 * así que no existe la relación que el embed `profiles(...)` necesita (rompía con
 * "Could not find a relationship"). Si el perfil faltara, cae a un guion.
 */
export async function getGroupVotes(groupId: string): Promise<VoteWithName[]> {
  const { data, error } = await supabase.from('votes').select('*').eq('group_id', groupId)
  if (error) throw error
  const votes = (data ?? []) as Vote[]
  if (votes.length === 0) return []

  const ids = [...new Set(votes.map((v) => v.user_id))]
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids)
  if (profilesError) throw profilesError
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return votes.map((vote) => {
    const profile = profileById.get(vote.user_id)
    return {
      ...vote,
      display_name: profile?.display_name ?? '—',
      avatar: profile?.avatar_url ?? null,
    }
  })
}
