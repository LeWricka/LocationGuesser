import { supabase } from './supabase'
import type { Player } from './database.types'

export interface EnsurePlayerInput {
  groupId: string
  name: string
  clientId: string
  pinHash: string
}

/**
 * Resultado de intentar registrar un nombre en un grupo:
 * - `created`: nombre libre, fila insertada (o ya nuestra) → puedes jugar.
 * - `claimed`: el nombre existía y el PIN coincide → recuperas esa identidad.
 * - `wrong-pin`: el nombre existe pero el PIN no coincide → pide otro PIN/nombre.
 */
export type EnsurePlayerResult =
  | { status: 'created'; player: Player }
  | { status: 'claimed'; player: Player }
  | { status: 'wrong-pin' }

/** Jugador por (group_id, name), o null si ese nombre está libre en el grupo. */
export async function getPlayer(groupId: string, name: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from('players')
    .select()
    .eq('group_id', groupId)
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Registra (o reclama) un nombre en un grupo.
 *
 * - Si el nombre está libre → inserta la fila y devuelve `created`.
 * - Si ya existe y el `pin_hash` coincide → es la misma persona (otro móvil o
 *   recarga): devuelve `claimed` sin tocar nada.
 * - Si existe pero el `pin_hash` no coincide → `wrong-pin` (ese nombre es de
 *   otro; el llamante pedirá el PIN correcto u otro nombre).
 *
 * El unique `(group_id, name)` de la BD es la verdad: una carrera entre dos
 * inserts la pierde uno, que reintenta leyendo la fila ganadora.
 */
export async function ensurePlayer(input: EnsurePlayerInput): Promise<EnsurePlayerResult> {
  const existing = await getPlayer(input.groupId, input.name)
  if (existing) return resolveExisting(existing, input.pinHash)

  const { data, error } = await supabase
    .from('players')
    .insert({
      group_id: input.groupId,
      name: input.name,
      client_id: input.clientId,
      pin_hash: input.pinHash,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation: alguien insertó el mismo nombre entre el SELECT
    // y el INSERT. Releemos la fila ganadora y resolvemos contra ella.
    if (isUniqueViolation(error)) {
      const winner = await getPlayer(input.groupId, input.name)
      if (winner) return resolveExisting(winner, input.pinHash)
    }
    throw error
  }
  return { status: 'created', player: data }
}

function resolveExisting(player: Player, pinHash: string): EnsurePlayerResult {
  if (player.pin_hash === pinHash) return { status: 'claimed', player }
  return { status: 'wrong-pin' }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  )
}
