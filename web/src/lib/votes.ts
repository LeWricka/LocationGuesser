import { supabase } from './supabase'
import { describeError } from './errors'
import type { Vote } from './database.types'

export interface SubmitVoteInput {
  challengeId: string
  // null en un voto de timeout: jugó pero no marcó → 0 puntos, sin pin.
  guessLat: number | null
  guessLng: number | null
}

/**
 * Resultado del voto, calculado y devuelto por el SERVIDOR (RPC `submit_vote`).
 * El cliente ya NO calcula los puntos ni conoce la respuesta antes de votar: la
 * RPC valida membresía + reto abierto, calcula distancia/puntos contra la
 * ubicación real (server-side) y revela la respuesta al instante. Ver migración 0010.
 */
export interface SubmitVoteResultClient {
  /** Distancia del acierto en km; null en un voto de timeout (sin pin). */
  distanceKm: number | null
  /** Puntos otorgados por el servidor (0 en timeout). */
  points: number
  /** Respuesta real para revelar el pin; null en un voto de timeout. */
  answerLat: number | null
  answerLng: number | null
}

/**
 * Emite el voto del usuario a través de la RPC `submit_vote` (autoridad de
 * servidor). El cliente solo manda su adivinanza (lat/lng) o null/null si se le
 * acabó el tiempo (voto de timeout). El servidor:
 *   · valida que es miembro del grupo y que el reto sigue abierto,
 *   · calcula distancia y puntos con la fórmula oficial (no se pueden falsear),
 *   · hace el upsert idempotente por (challenge_id, user_id) — revotar no duplica,
 *   · devuelve la distancia, los puntos y la respuesta para revelar al instante.
 * La identidad (user_id) y el group_id los pone el servidor desde la sesión y el
 * reto: no se pasan desde el cliente. Sigue insertándose una fila en `votes`, así
 * que el marcador Realtime se actualiza igual que antes.
 */
export async function submitVote(input: SubmitVoteInput): Promise<SubmitVoteResultClient> {
  const { data, error } = await supabase.rpc('submit_vote', {
    p_challenge_id: input.challengeId,
    p_lat: input.guessLat,
    p_lng: input.guessLng,
  })
  // El error de la RPC es un objeto de PostgREST (no Error nativo): lo
  // re-lanzamos como Error con mensaje legible (describeError combina
  // message/details/hint/code) para que el toast no muestre '[object Object]'.
  if (error) throw new Error(describeError(error))
  // La RPC `returns table` llega como array de una fila.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('La RPC submit_vote no devolvió resultado')
  return {
    distanceKm: row.distance_km,
    points: row.points,
    answerLat: row.answer_lat,
    answerLng: row.answer_lng,
  }
}

/**
 * Voto previo de un usuario en un reto, o null si aún no ha jugado.
 * `maybeSingle` para que "no hay fila" no sea un error.
 */
export async function getExistingVote(challengeId: string, userId: string): Promise<Vote | null> {
  const { data, error } = await supabase
    .from('votes')
    .select()
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
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
