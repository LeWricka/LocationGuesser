import { supabase } from './supabase'
import { describeError } from './errors'
import type { Vote } from './database.types'

export interface SubmitVoteInput {
  challengeId: string
  // null en un voto de timeout: jugó pero no marcó → 0 puntos, sin pin.
  guessLat: number | null
  guessLng: number | null
  // El jugador cambió de pestaña/app durante la jugada (anti-trampa, issue #200).
  // Se persiste en el voto (`votes.left_app`) y se muestra como ⚠️ en el marcador.
  // Opcional: si no se pasa, la RPC usa su default (false).
  leftApp?: boolean
  // Segundos que tardó el jugador en votar, medidos en cliente (wall-clock desde
  // que empezó a jugar hasta que confirmó). Se persiste en `votes.elapsed_seconds`
  // (issue #214). Opcional/null: si no hay un inicio válido, la RPC usa su default.
  elapsedSeconds?: number | null
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
    p_left_app: input.leftApp ?? false,
    p_elapsed_seconds: input.elapsedSeconds ?? null,
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

export interface SubmitNumberVoteInput {
  challengeId: string
  // null en un voto de timeout: jugó pero no respondió → 0 puntos, sin cifra.
  guess: number | null
  // El jugador cambió de pestaña/app durante la jugada (anti-trampa). Opcional.
  leftApp?: boolean
  // Segundos que tardó el jugador en votar (cliente). Opcional/null.
  elapsedSeconds?: number | null
}

/**
 * Resultado del voto de NÚMERO, calculado y devuelto por el SERVIDOR (RPC
 * `submit_number_vote`). El cliente NO calcula los puntos ni conoce la cifra antes de
 * votar: la RPC valida membresía + reto abierto, calcula el error relativo y los
 * puntos contra la respuesta oculta (server-side) y revela la cifra al instante. 0029.
 */
export interface SubmitNumberVoteResultClient {
  /** Error absoluto |cifra − respuesta|; null en un voto de timeout. */
  absError: number | null
  /** Error relativo (absError / max(|respuesta|, 1)); null en timeout. */
  relError: number | null
  /** Puntos otorgados por el servidor (0 en timeout). */
  points: number
  /** La cifra correcta para el revelado; null en un voto de timeout. */
  answerNumber: number | null
}

/**
 * Emite el voto de un reto de NÚMERO ("¿Cuánto?") vía la RPC `submit_number_vote`
 * (autoridad de servidor). HERMANA de `submitVote`: el cliente solo manda su cifra
 * (o null si se le acabó el tiempo). El servidor valida membresía/estado, puntúa por
 * error relativo con la fórmula oficial (no se puede falsear), hace el upsert
 * idempotente por (challenge_id, user_id) y devuelve el revelado. Listo para la UI
 * (que llega en otra fase).
 */
export async function submitNumberVote(
  input: SubmitNumberVoteInput,
): Promise<SubmitNumberVoteResultClient> {
  const { data, error } = await supabase.rpc('submit_number_vote', {
    p_challenge_id: input.challengeId,
    p_guess: input.guess,
    p_left_app: input.leftApp ?? false,
    p_elapsed_seconds: input.elapsedSeconds ?? null,
  })
  if (error) throw new Error(describeError(error))
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('La RPC submit_number_vote no devolvió resultado')
  return {
    absError: row.abs_error,
    relError: row.rel_error,
    points: row.points,
    answerNumber: row.answer_number,
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

/**
 * Borra el voto PROPIO en un reto. Lo usa "volver a jugar" (solo en retos de
 * práctica): al borrar el voto, el flujo de juego vuelve a permitir votar.
 * La RLS `votes_delete_self` (migración 0004) limita el borrado a las filas del
 * propio usuario (`user_id = auth.uid()`), así que filtrar solo por `challenge_id`
 * no puede tocar votos ajenos. Lanza si Supabase devuelve error.
 */
export async function deleteMyVote(challengeId: string): Promise<void> {
  const { error } = await supabase.from('votes').delete().eq('challenge_id', challengeId)
  if (error) throw error
}
