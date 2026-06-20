// Perfil público del usuario (profiles, 1:1 con auth.users). El display_name es
// GLOBAL (no por grupo) y es lo que se muestra en rankings; ver cuentas-y-home.md
// §4.1. El trigger `handle_new_user` (migración 0004) ya crea la fila en el primer
// registro con un display_name provisional, así que aquí solo leemos/afinamos.

import { supabase } from './supabase'
import type { Profile } from './database.types'

/** Perfil de un usuario por id, o null si aún no existe la fila. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select().eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export interface UpsertProfileInput {
  /** Id del usuario (auth.uid). RLS exige que sea el propio. */
  id: string
  displayName: string
  avatarUrl?: string | null
}

/**
 * Crea o actualiza el perfil propio (paso de perfil del onboarding y edición
 * desde la home). Upsert por la PK `id`: si el trigger ya creó la fila, la
 * actualiza; si no, la inserta. RLS restringe a `id = auth.uid()`.
 */
export async function upsertProfile(input: UpsertProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: input.id,
      display_name: input.displayName,
      // Solo tocamos avatar_url si viene definido (incluido null explícito para
      // borrarlo); `undefined` lo deja como esté.
      ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
    })
    .select()
    .single()
  if (error) throw error
  return data
}
