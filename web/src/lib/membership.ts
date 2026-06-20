// Membresía: "mis grupos", auto-join y "te toca jugar". Sustituye a la derivación
// de grupos por enlaces sueltos (cuentas-y-home.md §4.2 y §3). Área de datos: las
// pantallas (home #3, onboarding #4) consumen estos helpers; aquí no hay UI.

import { supabase } from './supabase'
import { isLive } from './groupData'
import type { Challenge } from './database.types'

/** Estado de un grupo en la home (cuentas-y-home.md §3.1, tarjetas "Tus grupos"). */
export type GroupStatus =
  | 'live' // 🔴 hay reto(s) abierto(s) (y ya voté los que me tocaban)
  | 'your-turn' // 🟡 hay reto abierto que aún no he votado (resaltado)
  | 'idle' // ⚪ sin retos abiertos pendientes

export interface MyGroup {
  id: string
  name: string | null
  role: string // 'owner' | 'member'
  /** Eres el dueño del grupo (chip 👑 "Tuyo"). */
  isOwner: boolean
  status: GroupStatus
}

/** Reto abierto que aún no he votado, para la sección "🔔 Te toca jugar". */
export interface PendingChallenge {
  challenge: Challenge
  groupId: string
  groupName: string | null
}

/**
 * Auto-join idempotente: al abrir un link `#g=CODE` con sesión, inserta (o deja
 * intacta) la fila propia en group_members. `onConflict: 'group_id,user_id'`
 * hace que reentrar no duplique ni falle. Solo escribe la fila propia (RLS lo
 * exige). Por defecto role='member' (el dueño se inserta como 'owner' al crear).
 */
export async function joinGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: userId },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/**
 * Alta del creador como dueño del grupo (role='owner'), al crearlo. Igual que
 * joinGroup pero con rol owner; idempotente. Se separa de joinGroup (que es el
 * auto-join de invitados, siempre 'member') para no mezclar responsabilidades.
 */
export async function joinGroupAsOwner(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: userId, role: 'owner' },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/** ¿Soy miembro de este grupo? (para decidir auto-join silencioso, §2 flujo C). */
export async function isMember(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

// Forma de la fila del join group_members → groups que pedimos a PostgREST.
interface MembershipRow {
  group_id: string
  role: string
  groups: { id: string; name: string | null; created_by: string | null } | null
}

/**
 * "Mis grupos" con estado y rol, para la sección "Tus grupos" de la home (§3.1).
 *
 * Resuelve en 3 consultas y compone en cliente (sin vistas en BD aún): (1) mis
 * membresías con el grupo embebido, (2) retos de esos grupos, (3) mis votos. El
 * estado de cada grupo se deriva: hay reto abierto sin mi voto → 🟡 your-turn;
 * hay reto abierto (todos votados) → 🔴 live; si no → ⚪ idle.
 */
export async function myGroups(userId: string): Promise<MyGroup[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role, groups ( id, name, created_by )')
    .eq('user_id', userId)
  if (error) throw error
  const rows = (data ?? []) as unknown as MembershipRow[]
  if (rows.length === 0) return []

  const groupIds = rows.map((r) => r.group_id)
  const [challenges, votedChallengeIds] = await Promise.all([
    challengesForGroups(groupIds),
    myVotedChallengeIds(userId, groupIds),
  ])

  const now = new Date()
  const byGroup = new Map<string, Challenge[]>()
  for (const c of challenges) {
    const list = byGroup.get(c.group_id) ?? []
    list.push(c)
    byGroup.set(c.group_id, list)
  }

  return rows.map((row) => {
    const groupChallenges = byGroup.get(row.group_id) ?? []
    const status = deriveStatus(groupChallenges, votedChallengeIds, now)
    return {
      id: row.group_id,
      name: row.groups?.name ?? null,
      role: row.role,
      isOwner: row.groups?.created_by === userId || row.role === 'owner',
      status,
    }
  })
}

/**
 * Retos abiertos en mis grupos que aún no he votado, ordenados por deadline más
 * próxima (cuentas-y-home.md §3.1, "🔔 Te toca jugar"). Vacío → la sección no se
 * muestra (decisión de UI #3).
 */
export async function pendingChallenges(userId: string): Promise<PendingChallenge[]> {
  const groups = await myGroups(userId)
  if (groups.length === 0) return []

  const groupIds = groups.map((g) => g.id)
  const nameById = new Map(groups.map((g) => [g.id, g.name]))
  const [challenges, votedChallengeIds] = await Promise.all([
    challengesForGroups(groupIds),
    myVotedChallengeIds(userId, groupIds),
  ])

  const now = new Date()
  return challenges
    .filter((c) => isLive(c, now) && !votedChallengeIds.has(c.id))
    .sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime())
    .map((c) => ({
      challenge: c,
      groupId: c.group_id,
      groupName: nameById.get(c.group_id) ?? null,
    }))
}

// ── Helpers internos ─────────────────────────────────────────────────────────

function deriveStatus(
  challenges: Challenge[],
  votedChallengeIds: Set<string>,
  now: Date,
): GroupStatus {
  const open = challenges.filter((c) => isLive(c, now))
  if (open.length === 0) return 'idle'
  const hasUnvoted = open.some((c) => !votedChallengeIds.has(c.id))
  return hasUnvoted ? 'your-turn' : 'live'
}

async function challengesForGroups(groupIds: string[]): Promise<Challenge[]> {
  if (groupIds.length === 0) return []
  const { data, error } = await supabase.from('challenges').select().in('group_id', groupIds)
  if (error) throw error
  return data ?? []
}

async function myVotedChallengeIds(userId: string, groupIds: string[]): Promise<Set<string>> {
  if (groupIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('votes')
    .select('challenge_id')
    .eq('user_id', userId)
    .in('group_id', groupIds)
  if (error) throw error
  return new Set((data ?? []).map((v) => v.challenge_id))
}
