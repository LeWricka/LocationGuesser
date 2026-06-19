import { supabase } from './supabase'
import type { Vote } from './database.types'

export interface SaveVoteInput {
  groupId: string
  challengeId: string
  playerName: string
  guessLat: number
  guessLng: number
  distanceKm: number
  points: number
}

/**
 * Guarda (o reemplaza) el voto de un jugador en un reto. Upsert por la unique
 * `(challenge_id, player_name)`: si el jugador recarga o reenvía, no duplica;
 * actualiza su fila. Devuelve la fila final.
 */
export async function saveVote(input: SaveVoteInput): Promise<Vote> {
  const { data, error } = await supabase
    .from('votes')
    .upsert(
      {
        group_id: input.groupId,
        challenge_id: input.challengeId,
        player_name: input.playerName,
        guess_lat: input.guessLat,
        guess_lng: input.guessLng,
        distance_km: input.distanceKm,
        points: input.points,
      },
      { onConflict: 'challenge_id,player_name' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Voto previo de un jugador en un reto, o null si aún no ha jugado.
 * `maybeSingle` para que "no hay fila" no sea un error.
 */
export async function getExistingVote(
  challengeId: string,
  playerName: string,
): Promise<Vote | null> {
  const { data, error } = await supabase
    .from('votes')
    .select()
    .eq('challenge_id', challengeId)
    .eq('player_name', playerName)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Todos los votos de un reto (para el marcador y el revelado). */
export async function getVotes(challengeId: string): Promise<Vote[]> {
  const { data, error } = await supabase.from('votes').select().eq('challenge_id', challengeId)
  if (error) throw error
  return data ?? []
}
