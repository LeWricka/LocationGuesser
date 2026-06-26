// Cliente de la vista de administración (solo lectura). Envuelve las RPCs
// `admin_*` (migración 0016), que son SECURITY DEFINER y comprueban `is_admin()`
// en el servidor: la seguridad REAL vive ahí. La allowlist de cliente
// (`isAdminEmail`) solo sirve para mostrar/ocultar la UI; no es una barrera de
// seguridad (un no-admin que fuerce la ruta recibiría 42501 del servidor).

import { supabase } from './supabase'
import type { Database } from './database.types'

// Tipos de dominio derivados de las RPCs (una fila del array de retorno).
export type AdminAnalytics = Database['public']['Functions']['admin_analytics']['Returns'][number]
export type AdminGroup = Database['public']['Functions']['admin_groups']['Returns'][number]
export type AdminGroupChallenge =
  Database['public']['Functions']['admin_group_challenges']['Returns'][number]

// Allowlist de admins en el cliente (solo para mostrar/ocultar la UI). El email
// del JWT lo valida el servidor; aquí solo evitamos pintar accesos a no-admins.
const ADMIN_EMAILS = ['iker@540deg.com']

/** ¿Es este email de un admin? Comparación case-insensitive y tolerante a
 * espacios. Solo gobierna la visibilidad de la UI; no es seguridad. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.trim().toLowerCase())
}

/** Agregados globales para el dashboard de admin. La RPC devuelve un array de una
 * sola fila; lo desempaquetamos. Propaga el error (la UI lo maneja). */
export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const { data, error } = await supabase.rpc('admin_analytics')
  if (error) throw error
  return data[0]
}

/** Lista de grupos (orden created_at desc) con sus contadores. */
export async function getAdminGroups(): Promise<AdminGroup[]> {
  const { data, error } = await supabase.rpc('admin_groups')
  if (error) throw error
  return data ?? []
}

/** Retos de un grupo (orden created_at desc) con métricas por reto. */
export async function getAdminGroupChallenges(groupId: string): Promise<AdminGroupChallenge[]> {
  const { data, error } = await supabase.rpc('admin_group_challenges', { p_group_id: groupId })
  if (error) throw error
  return data ?? []
}
