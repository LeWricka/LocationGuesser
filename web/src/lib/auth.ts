// Capa de auth: helpers tipados sobre supabase.auth, sin UI. La presentación
// (features/onboarding) los consume. La política del hito es passwordless puro
// vía magic link (email); ver cuentas-y-home.md §1.2 y §2.
//
// El magic link une "darse de alta" + "verificar email" en un paso: el usuario
// mete su email, pulsa el enlace y queda creado + verificado a la vez. Al volver
// a la app, `detectSessionInUrl` (ver supabase.ts) procesa el token y crea la
// sesión sin más código.

import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Clave de localStorage donde guardamos el destino (el hash #g=…&c=…) antes de
// mandar al usuario al email. Al volver con sesión se restaura para llevarlo
// DIRECTO al reto y no a una home genérica (cuentas-y-home.md §2.1, riesgo de
// "rebote en el handoff app→email→app").
const NEXT_KEY = 'lg.next'

// A dónde vuelve el usuario tras pulsar el magic link. Por defecto el origin
// actual: funciona igual en localhost y en prod sin hardcodear el dominio. El
// llamante puede pasar un `redirectTo` concreto (p.ej. el origin + el hash del
// reto) para aterrizar directamente en el destino.
function defaultRedirect(): string {
  return window.location.origin
}

// Login por magic link. Supabase manda un email con un enlace; al abrirlo, el
// cliente detecta el token en la URL y crea la sesión. No hay contraseña.
//
// - `displayName`: si es el primer registro, viaja en `options.data.display_name`
//   y el trigger `handle_new_user` (migración 0004) lo usa como display_name
//   provisional del perfil. El paso de perfil del onboarding lo puede afinar luego.
// - `redirectTo`: a dónde volver tras el email; por defecto el origin actual.
export async function signInWithMagicLink(
  email: string,
  displayName?: string,
  redirectTo?: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo ?? defaultRedirect(),
      // Solo mandamos display_name si viene; así no pisamos con vacío el que ya
      // tuviera el usuario en un re-login.
      data: displayName ? { display_name: displayName } : undefined,
    },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Sesión actual (o null si no hay login). Útil para el gating inicial: antes de
// pintar la home o de auto-join, comprobar que existe sesión.
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

// Usuario actual (o null). `user.id` es el uuid que va a `created_by`/`user_id`.
export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

// Suscripción a cambios de sesión (login/logout/refresh). Devuelve la
// Subscription para que el llamante haga `unsubscribe()` al desmontar.
export function onAuthStateChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(cb)
  return subscription
}

// ── Destino deep-link (lg.next) ──────────────────────────────────────────────
// Antes de mandar al usuario al email guardamos a qué reto/grupo iba; al volver
// con sesión lo restauramos. El wiring en App/router lo hace #4; aquí solo el
// almacenamiento, que es lógica de datos.

/** Guarda el destino (hash `#g=…&c=…` o ruta) para restaurarlo tras el login. */
export function setNextDestination(hash: string): void {
  if (hash) localStorage.setItem(NEXT_KEY, hash)
}

/** Lee el destino guardado, o null si no hay ninguno pendiente. */
export function getNextDestination(): string | null {
  return localStorage.getItem(NEXT_KEY)
}

/** Consume el destino: lo devuelve y lo borra (uso único, evita bucles). */
export function takeNextDestination(): string | null {
  const next = localStorage.getItem(NEXT_KEY)
  if (next) localStorage.removeItem(NEXT_KEY)
  return next
}
