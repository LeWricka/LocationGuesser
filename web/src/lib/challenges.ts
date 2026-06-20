import { supabase } from './supabase'
import type { Challenge } from './database.types'
import { newGroupCode } from './group'
import { deadlineFromNow } from './time'

export interface NewChallengeInput {
  title: string
  lat: number
  lng: number
  /** uuid del usuario de la sesión (`user.id`). Queda como `created_by` del reto. */
  createdBy: string
  /** Si no se pasa, se crea un grupo nuevo. */
  groupId?: string
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

async function ensureGroup(groupId?: string): Promise<string> {
  if (groupId) return groupId
  const code = newGroupCode()
  const { error } = await supabase.from('groups').insert({ id: code })
  if (error) throw error
  return code
}

export async function createChallenge(
  input: NewChallengeInput,
): Promise<{ challenge: Challenge; groupId: string }> {
  const groupId = await ensureGroup(input.groupId)
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
 * Borra un reto. Solo el dueño del grupo lo consigue (RLS lo respalda; la UI
 * además esconde la acción a los miembros). Lanza si Supabase devuelve error.
 */
export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw error
}
