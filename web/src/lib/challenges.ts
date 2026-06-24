import { supabase } from './supabase'
import type { Challenge, Database } from './database.types'
import type { LatLng } from './geo'
import { deadlineFromNow } from './time'

type ChallengeUpdate = Database['public']['Tables']['challenges']['Update']

/**
 * Reto SIN la respuesta (lat/lng). Es lo que se sirve al jugar: el payload del
 * mapa de adivinar NO debe contener la ubicación real. La respuesta vive en
 * `challenge_answers` y se obtiene solo al votar (vía RPC) o al recargar un reto
 * ya votado/cerrado (vía `getAnswer`, gobernado por RLS). Migración 0010.
 */
export type ChallengeForPlay = Omit<Challenge, 'lat' | 'lng'>

// Columnas del reto SIN lat/lng: lo que CUALQUIER lectura de `challenges` por el
// cliente puede pedir tras revocar el privilegio de columna lat/lng (migración 0010).
// La respuesta (lat/lng) ya no es legible desde `challenges`; vive en
// `challenge_answers` (RLS). Reutilizado por todos los lectores: jugar, lista del
// grupo, home y el RETURNING de crear/editar.
export const CHALLENGE_COLUMNS_NO_ANSWER =
  'id, group_id, title, image_path, sv_pano_id, sv_heading, sv_pitch, guess_seconds, deadline_at, photo_is_hint, created_by, created_at'

export interface NewChallengeInput {
  title: string
  lat: number
  lng: number
  /** uuid del usuario de la sesión (`user.id`). Queda como `created_by` del reto. */
  createdBy: string
  /** Grupo al que pertenece el reto (siempre existe ya: flujo grupo-primero). */
  groupId: string
  /** Segundos por jugada; null = sin límite. (#13 añade la UI.) */
  guessSeconds?: number | null
  /** Plazo del reto en ISO absoluto; por defecto, 24 h desde ahora (duración relativa). */
  deadlineAt?: string
  /** Path en Storage de la imagen del reto (foto opcional, sin EXIF). */
  imagePath?: string
  /**
   * Si hay foto, ¿se muestra como pista al jugar (true) o se reserva sorpresa
   * para el revelado (false)? Por defecto pista. Sin efecto si no hay foto.
   */
  photoIsHint?: boolean
  /** Panorama de Street View encajado al punto. (#54.) */
  svPanoId?: string
  /** POV inicial del panorama: rumbo en grados. (#54.) */
  svHeading?: number
  /** POV inicial del panorama: inclinación en grados. (#54.) */
  svPitch?: number
}

// Plazo por defecto si el creador no eligió uno: 24 h desde ahora. La duración
// relativa sustituye al ambiguo "fin del día" (que dependía del huso del lector).
const DEFAULT_DURATION_HOURS = 24

// Umbral de "reto de práctica": un plazo a más de 365 días vista. Los retos
// reales duran como mucho ~48 h; solo los de práctica (p.ej. el infinito de
// Iruña, con cierre en el año 2999) caen tan lejos. Se usa para permitir "volver
// a jugar" SOLO en práctica: en un reto real, rejugar tras ver la respuesta sería
// trampa.
const PRACTICE_DEADLINE_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ¿Es un reto de PRÁCTICA? True si el plazo está a más de un año vista (los retos
 * reales son ≤48 h; el infinito de práctica cierra en 2999). Función pura para
 * gatear "volver a jugar" en la UI sin depender del servidor.
 */
export function isPracticeChallenge(deadlineAt: string): boolean {
  const ms = new Date(deadlineAt).getTime() - Date.now()
  return ms > PRACTICE_DEADLINE_DAYS * DAY_MS
}

export async function createChallenge(
  input: NewChallengeInput,
): Promise<{ challenge: ChallengeForPlay; groupId: string }> {
  const groupId = input.groupId
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      group_id: groupId,
      title: input.title,
      lat: input.lat,
      lng: input.lng,
      image_path: input.imagePath ?? null,
      photo_is_hint: input.photoIsHint ?? true,
      sv_pano_id: input.svPanoId ?? null,
      sv_heading: input.svHeading ?? null,
      sv_pitch: input.svPitch ?? null,
      guess_seconds: input.guessSeconds ?? null,
      deadline_at: input.deadlineAt ?? deadlineFromNow(DEFAULT_DURATION_HOURS),
      created_by: input.createdBy,
    })
    // RETURNING sin lat/lng: tras revocar la columna (0010), pedirlas aquí daría
    // error de permiso. La respuesta ya queda espejada en challenge_answers abajo.
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error

  // Espejamos la respuesta en `challenge_answers` (fuente que la RPC consulta y que
  // el cliente solo puede leer tras votar o al cerrarse el reto). `challenges.lat/lng`
  // se mantienen por compatibilidad con los lectores de retos cerrados. Migración 0010.
  //
  // UPSERT idempotente (onConflict: challenge_id): la migración 0012 añade un
  // trigger que escribe esta misma respuesta en la misma transacción del INSERT
  // del reto. Con upsert no chocamos con el trigger en ningún orden de despliegue
  // (deploy-safe): si la fila ya existe (la creó el trigger), la igualamos en vez
  // de fallar por clave duplicada.
  const { error: answerError } = await supabase
    .from('challenge_answers')
    .upsert(
      { challenge_id: data.id, lat: input.lat, lng: input.lng },
      { onConflict: 'challenge_id' },
    )
  if (answerError) throw answerError

  return { challenge: data, groupId }
}

/**
 * Lee un reto por su id PARA JUGAR, SIN la respuesta (lat/lng). El payload que
 * alimenta el mapa de adivinar no debe contener la ubicación real: se revela solo
 * al votar (RPC `submit_vote`) o al recargar un reto ya votado/cerrado (`getAnswer`).
 * Lanza si no existe o hay error de red.
 */
export async function getChallenge(id: string): Promise<ChallengeForPlay> {
  const { data, error } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .eq('id', id)
    .single<ChallengeForPlay>()
  if (error) throw error
  return data
}

/**
 * Respuestas (lat/lng) de varios retos a la vez, indexadas por challenge_id. La RLS
 * de `challenge_answers` solo devuelve las que el solicitante puede ver (reto cerrado
 * o ya votado; el dueño, las suyas). La usa la página del grupo para pintar el pin de
 * la respuesta en los retos CERRADOS (sección "anteriores") sin un fetch por tarjeta.
 */
export async function getAnswers(challengeIds: string[]): Promise<Map<string, LatLng>> {
  if (challengeIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('challenge_answers')
    .select('challenge_id, lat, lng')
    .in('challenge_id', challengeIds)
  if (error) throw error
  return new Map((data ?? []).map((a) => [a.challenge_id, { lat: a.lat, lng: a.lng }]))
}

/**
 * Respuesta (lat/lng) de un reto, o null si el usuario aún no tiene derecho a verla.
 * La RLS de `challenge_answers` (migración 0010) solo la sirve si el reto ya está
 * cerrado o si el usuario ya votó. Se usa al RECARGAR un reto ya jugado para volver
 * a pintar el pin de la respuesta (el revelado inmediato tras votar usa la RPC).
 * `maybeSingle`: "sin derecho / sin fila" no es un error, es null.
 */
export async function getAnswer(challengeId: string): Promise<LatLng | null> {
  const { data, error } = await supabase
    .from('challenge_answers')
    .select('lat, lng')
    .eq('challenge_id', challengeId)
    .maybeSingle()
  if (error) throw error
  return data ? { lat: data.lat, lng: data.lng } : null
}

/**
 * Nº de votos (jugadas) de un reto. Lo usa la edición para decidir si la
 * UBICACIÓN sigue siendo editable: con votos ya guardados, cambiar lat/lng
 * alteraría la respuesta y las distancias/puntos ya calculados (ver
 * `updateChallenge`). `head: true` + `count` no trae filas, solo el número.
 */
export async function countVotes(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
  if (error) throw error
  return count ?? 0
}

/**
 * Campos editables de un reto. La UBICACIÓN (`lat`/`lng` + el panorama y POV de
 * Street View que la acompañan) es OPCIONAL a propósito: solo se permite cambiar
 * mientras el reto no tenga votos. El resto (título, foto, duración, tiempo por
 * jugada) se puede editar siempre.
 */
export interface UpdateChallengeInput {
  title?: string
  /** Plazo del reto en ISO absoluto (duración relativa ya congelada). */
  deadlineAt?: string
  /** Segundos por jugada; null = sin límite. */
  guessSeconds?: number | null
  /** Path en Storage de la nueva foto (sin EXIF); null la quita. */
  imagePath?: string | null
  /** Si hay foto, pista visible al jugar (true) o sorpresa hasta el revelado (false). */
  photoIsHint?: boolean
  /**
   * Nueva ubicación + panorama. SOLO se aplica si el reto no tiene votos; si los
   * tiene, `updateChallenge` la ignora (y la UI bloquea el campo). Va junta porque
   * cambiar el punto sin recolocar el panorama dejaría el Street View incoherente.
   */
  location?: {
    lat: number
    lng: number
    svPanoId?: string
    svHeading?: number
    svPitch?: number
  }
}

/**
 * Edita un reto. Solo el dueño del grupo lo consigue (RLS `challenges_update_owner`
 * lo respalda; la UI esconde la acción a los miembros).
 *
 * REGLA DE INTEGRIDAD: la ubicación solo se puede cambiar mientras el reto NO
 * tenga votos. Con votos ya guardados, mover lat/lng cambiaría la respuesta y
 * dejaría inconsistentes las distancias/puntos ya calculados (no los recalculamos
 * a posteriori). Por eso comprobamos `countVotes` aquí, en la capa de datos, aunque
 * la UI ya bloquee el campo: la regla no debe depender solo del cliente.
 */
export async function updateChallenge(
  id: string,
  input: UpdateChallengeInput,
): Promise<ChallengeForPlay> {
  const patch: ChallengeUpdate = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.deadlineAt !== undefined) patch.deadline_at = input.deadlineAt
  if (input.guessSeconds !== undefined) patch.guess_seconds = input.guessSeconds
  if (input.imagePath !== undefined) patch.image_path = input.imagePath
  if (input.photoIsHint !== undefined) patch.photo_is_hint = input.photoIsHint

  if (input.location !== undefined) {
    const votes = await countVotes(id)
    if (votes > 0) {
      throw new Error('No se puede cambiar la ubicación de un reto que ya tiene jugadas.')
    }
    patch.lat = input.location.lat
    patch.lng = input.location.lng
    patch.sv_pano_id = input.location.svPanoId ?? null
    patch.sv_heading = input.location.svHeading ?? null
    patch.sv_pitch = input.location.svPitch ?? null
  }

  const { data, error } = await supabase
    .from('challenges')
    .update(patch)
    .eq('id', id)
    // RETURNING sin lat/lng (columna revocada en 0010); la respuesta nueva se espeja
    // en challenge_answers abajo cuando cambia la ubicación.
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error

  // Si cambió la ubicación (solo posible sin votos), espejamos la respuesta en
  // `challenge_answers` para que la RPC y el revelado usen la nueva. Migración 0010.
  // UPSERT idempotente (onConflict: challenge_id): deploy-safe frente al trigger de
  // la 0012 — si por cualquier motivo no existiera la fila, la crea en vez de fallar.
  if (input.location !== undefined) {
    const { error: answerError } = await supabase
      .from('challenge_answers')
      .upsert(
        { challenge_id: id, lat: input.location.lat, lng: input.location.lng },
        { onConflict: 'challenge_id' },
      )
    if (answerError) throw answerError
  }

  return data
}

/**
 * Borra un reto. Solo el dueño del grupo lo consigue (RLS lo respalda; la UI
 * además esconde la acción a los miembros). Lanza si Supabase devuelve error.
 */
export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw error
}
