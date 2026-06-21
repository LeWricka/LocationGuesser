import { supabase } from './supabase'
import type { Challenge } from './database.types'

/** Id + nombre + premios del grupo. El nombre titula la página (si falta, cae al
 * código); `prizes` es el texto libre de "qué se juega" en la clasificación. */
export interface GroupInfo {
  id: string
  name: string | null
  prizes: string | null
}

/** Lee el grupo (id + nombre + premios) para la página, o null si no existe. */
export async function getGroup(groupId: string): Promise<GroupInfo | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, prizes')
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Guarda el texto de "qué se juega" del grupo (premios de la clasificación
 * general). Texto vacío → null (borra el premio). Solo el dueño puede: el RLS de
 * groups (groups_update_owner) restringe el UPDATE a created_by = auth.uid(), así
 * que un miembro recibe error/0 filas; aquí no comprobamos rol en cliente.
 */
export async function updateGroupPrizes(groupId: string, prizes: string): Promise<void> {
  const trimmed = prizes.trim()
  const { error } = await supabase
    .from('groups')
    .update({ prizes: trimmed === '' ? null : trimmed })
    .eq('id', groupId)
  if (error) throw error
}

/**
 * Retos de un grupo, del más reciente al más antiguo. Alimenta la página del
 * grupo: separamos "en vivo" (deadline futura) de "anteriores" en la vista.
 */
export async function getGroupChallenges(groupId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select()
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Un reto está abierto si su plazo aún no ha vencido (comparado con `now`). */
export function isLive(challenge: Pick<Challenge, 'deadline_at'>, now: Date = new Date()): boolean {
  return new Date(challenge.deadline_at).getTime() > now.getTime()
}

/**
 * Parte los retos en abiertos (en vivo) y cerrados (anteriores), conservando el
 * orden de entrada (más reciente primero). Función pura: fácil de testear.
 */
export function splitByStatus<T extends Pick<Challenge, 'deadline_at'>>(
  challenges: T[],
  now: Date = new Date(),
): { live: T[]; past: T[] } {
  const live: T[] = []
  const past: T[] = []
  for (const c of challenges) {
    if (isLive(c, now)) live.push(c)
    else past.push(c)
  }
  return { live, past }
}
