import { supabase } from './supabase'
import type { Challenge, Database } from './database.types'
import { deadlineFromNow } from './time'

type ChallengeUpdate = Database['public']['Tables']['challenges']['Update']

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

export async function createChallenge(
  input: NewChallengeInput,
): Promise<{ challenge: Challenge; groupId: string }> {
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
    .select()
    .single()
  if (error) throw error
  return { challenge: data, groupId }
}

/** Lee un reto por su id. Lanza si no existe o hay error de red. */
export async function getChallenge(id: string): Promise<Challenge> {
  const { data, error } = await supabase.from('challenges').select().eq('id', id).single()
  if (error) throw error
  return data
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
export async function updateChallenge(id: string, input: UpdateChallengeInput): Promise<Challenge> {
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
    .select()
    .single()
  if (error) throw error
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
