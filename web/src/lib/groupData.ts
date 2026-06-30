import { supabase } from './supabase'
import type { Challenge, GroupPrizes } from './database.types'
import { CHALLENGE_COLUMNS_NO_ANSWER, type ChallengeForPlay } from './challenges'

/** Id + nombre + premios del grupo. El nombre titula la página (si falta, cae al
 * código); `prizes` son los premios por posición (1º/2º/3º/último) que se marcan
 * en la clasificación general (null si el dueño no ha definido ninguno).
 * `closed_at` marca el fin de temporada: null = activo; con fecha = archivado
 * (la página pasa a solo-lectura y muestra el podio final).
 * Los campos del viaje (0027) son contenido editorial opcional: fechas, de qué va,
 * con quién y portada. Todos null cuando el creador no los rellenó. */
export interface GroupInfo {
  id: string
  name: string | null
  prizes: GroupPrizes | null
  closed_at: string | null
  starts_on: string | null
  ends_on: string | null
  description: string | null
  companions: string | null
  cover_image_path: string | null
}

/** Lee el grupo (id + nombre + premios + cierre + datos del viaje) para la página,
 * o null si no existe. */
export async function getGroup(groupId: string): Promise<GroupInfo | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      'id, name, prizes, closed_at, starts_on, ends_on, description, companions, cover_image_path',
    )
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Datos del viaje que el creador rellena al arrancar (todos opcionales salvo el
 * nombre, que va aparte). Fechas en 'YYYY-MM-DD'; `companions` es texto libre
 * informativo (no membresía). */
export interface NewTripData {
  name: string
  startsOn?: string | null
  endsOn?: string | null
  description?: string | null
  companions?: string | null
  coverImagePath?: string | null
}

/** Fila lista para insertar en `groups`. Pública para testear `buildGroupInsert`
 * sin tocar Supabase. */
export interface GroupInsertRow {
  id: string
  name: string | null
  created_by: string
  starts_on: string | null
  ends_on: string | null
  description: string | null
  companions: string | null
  cover_image_path: string | null
}

/** Recorta un texto opcional; vacío o solo espacios → null (no guardamos cadenas
 * vacías, que ensucian la cabecera y el resumen). */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Construye la fila a insertar en `groups` a partir de los datos del viaje.
 * Función pura (sin Supabase): recorta los textos, normaliza vacíos a null y, si
 * el rango de fechas viene al revés (fin antes que inicio), lo intercambia para
 * no guardar un rango imposible. Fácil de testear.
 */
export function buildGroupInsert(
  groupId: string,
  userId: string,
  trip: NewTripData,
): GroupInsertRow {
  let starts = cleanText(trip.startsOn)
  let ends = cleanText(trip.endsOn)
  // Rango invertido (fin < inicio) → lo enderezamos: el usuario tocó las fechas
  // en otro orden, pero el viaje siempre va de la más temprana a la más tardía.
  if (starts && ends && ends < starts) {
    ;[starts, ends] = [ends, starts]
  }
  return {
    id: groupId,
    name: cleanText(trip.name),
    created_by: userId,
    starts_on: starts,
    ends_on: ends,
    description: cleanText(trip.description),
    companions: cleanText(trip.companions),
    cover_image_path: cleanText(trip.coverImagePath),
  }
}

/**
 * Crea el viaje (grupo) con el nombre y los datos opcionales. El creador queda
 * como dueño vía `created_by` (lo exige el RLS de groups). Devuelve el id del
 * grupo creado. La membresía 'owner' la añade el llamante (joinGroupAsOwner),
 * como en el flujo original.
 */
export async function createGroup(
  groupId: string,
  userId: string,
  trip: NewTripData,
): Promise<void> {
  const { error } = await supabase.from('groups').insert(buildGroupInsert(groupId, userId, trip))
  if (error) throw new Error(error.message)
}

/**
 * Cierra la temporada del grupo (fin de temporada): congela la clasificación y
 * deja el grupo en solo-lectura. Va por la RPC `close_group` (SECURITY DEFINER),
 * que comprueba en servidor que quien llama es el dueño; un miembro recibe error.
 */
export async function closeGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('close_group', { p_group_id: groupId })
  if (error) throw error
}

/**
 * Reabre la temporada del grupo (vuelve a activo: se puede crear retos y votar).
 * Va por la RPC `reopen_group` (SECURITY DEFINER), que comprueba la propiedad en
 * servidor igual que `close_group`.
 */
export async function reopenGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_group', { p_group_id: groupId })
  if (error) throw error
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
export async function getGroupChallenges(groupId: string): Promise<ChallengeForPlay[]> {
  const { data, error } = await supabase
    .from('challenges')
    // Sin lat/lng (columna revocada en 0010): la respuesta de los retos cerrados se
    // pide aparte con `getAnswers` (RLS la sirve solo para cerrados/ya votados).
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ChallengeForPlay[]
}

/**
 * Un reto está abierto si su plazo aún no ha vencido (comparado con `now`). Un
 * momento SIN plazo (`deadline_at = null`: un recuerdo, desde 0022) nunca está "en
 * vivo" → false (no es un reto jugable).
 */
export function isLive(challenge: Pick<Challenge, 'deadline_at'>, now: Date = new Date()): boolean {
  if (challenge.deadline_at == null) return false
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
