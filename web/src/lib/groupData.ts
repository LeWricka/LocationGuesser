import { supabase } from './supabase'
import type { Challenge, GroupPrizes } from './database.types'

/** Id + nombre + premios del grupo. El nombre titula la página (si falta, cae al
 * código); `prizes` son los premios por posición (1º/2º/3º/último) que se marcan
 * en la clasificación general (null si el dueño no ha definido ninguno). */
export interface GroupInfo {
  id: string
  name: string | null
  prizes: GroupPrizes | null
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
 * Normaliza los premios por posición antes de guardar: recorta cada texto y
 * descarta las claves vacías. Si no queda ninguna, devuelve null (borra todos los
 * premios). Función pura: fácil de testear sin tocar Supabase.
 */
export function normalizePrizes(prizes: GroupPrizes): GroupPrizes | null {
  const order: (keyof GroupPrizes)[] = ['first', 'second', 'third', 'last']
  const clean: GroupPrizes = {}
  for (const key of order) {
    const value = prizes[key]?.trim()
    if (value) clean[key] = value
  }
  return Object.keys(clean).length > 0 ? clean : null
}

/**
 * Guarda los premios por posición del grupo (jsonb). Recorta y descarta claves
 * vacías; si todas están vacías, guarda null (borra los premios). Solo el dueño
 * puede: el RLS de groups (groups_update_owner) restringe el UPDATE a
 * created_by = auth.uid(), así que un miembro recibe error/0 filas; aquí no
 * comprobamos rol en cliente.
 */
export async function updateGroupPrizes(groupId: string, prizes: GroupPrizes): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ prizes: normalizePrizes(prizes) })
    .eq('id', groupId)
  if (error) throw error
}

/**
 * Renombra el grupo. Solo el dueño lo consigue: el RLS `groups_update_owner`
 * restringe el UPDATE a `created_by = auth.uid()`, así que un miembro recibe 0
 * filas; no comprobamos rol en cliente. Recortamos el nombre; vacío → null (cae
 * al código del grupo en la cabecera, como hace `getGroup`).
 */
export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  const { error } = await supabase
    .from('groups')
    .update({ name: trimmed || null })
    .eq('id', groupId)
  if (error) throw error
}

/**
 * Borra el grupo entero. Solo el dueño (RLS `groups_delete_owner`). El borrado
 * arrastra en cascada retos, votos y membresías (FK on delete cascade de la
 * migración 0004), por eso la UI exige una confirmación fuerte antes de llamar.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
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
