// Perfil público del usuario (profiles, 1:1 con auth.users). El display_name es
// GLOBAL (no por grupo) y es lo que se muestra en rankings; ver cuentas-y-home.md
// §4.1. El trigger `handle_new_user` (migración 0004) ya crea la fila en el primer
// registro con un display_name provisional, así que aquí solo leemos/afinamos.

import { supabase } from './supabase'
import type { Profile, ProfileOnboarding } from './database.types'
import { markOnboardingSeen, type OnboardingContext } from './onboardingFlags'

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

/**
 * Arreglo de RAÍZ del onboarding repetido (issue #717, ver diagnóstico en
 * lib/onboardingFlags.ts): marca un tutorial como visto EN LA CUENTA, no solo
 * en este navegador. Siempre escribe primero la caché local (inmediata, cubre
 * el receptor anónimo pre-login, que no tiene `userId` todavía) y, si hay
 * sesión, intenta persistir en `profiles.onboarding` (merge con lo que ya
 * traía el perfil cargado, para no pisar otros tutoriales ya vistos).
 *
 * Degradación honesta: si la columna aún no existe (migración 0039 no
 * aplicada todavía) o falla la red, el error se traga en silencio — el
 * localStorage ya cubre "visto" en este navegador, y en cuanto el perfil
 * cargue con la columna disponible, la próxima llamada lo persistirá.
 */
export async function persistOnboardingSeen(
  context: OnboardingContext,
  userId: string | null | undefined,
  currentOnboarding: ProfileOnboarding | null | undefined,
): Promise<void> {
  markOnboardingSeen(context, userId)
  if (!userId) return // sin sesión: comportamiento actual, solo localStorage.
  try {
    const next: ProfileOnboarding = {
      ...(currentOnboarding ?? {}),
      [context]: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update({ onboarding: next }).eq('id', userId)
    if (error) throw error
  } catch {
    // Ver docstring: degradación honesta, nunca rompe el cierre del tutorial.
  }
}
