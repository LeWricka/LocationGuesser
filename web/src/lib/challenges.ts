import { supabase } from './supabase'
import type { Challenge } from './database.types'
import { newGroupCode } from './group'

export interface NewChallengeInput {
  title: string
  lat: number
  lng: number
  createdBy: string
  /** Si no se pasa, se crea un grupo nuevo. */
  groupId?: string
  /** Segundos por jugada; null = sin límite. (#13 añade la UI.) */
  guessSeconds?: number | null
  /** Plazo del reto en ISO; por defecto, fin del día del creador. (#13.) */
  deadlineAt?: string
  /** Path en Storage de la imagen del reto. (#4.) */
  imagePath?: string
}

function endOfTodayISO(): string {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

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
      guess_seconds: input.guessSeconds ?? null,
      deadline_at: input.deadlineAt ?? endOfTodayISO(),
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
