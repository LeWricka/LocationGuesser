// Capa de auth: helpers tipados sobre supabase.auth, sin UI. La presentación
// (features/onboarding) los consume. La política del hito es passwordless puro
// (email); ver cuentas-y-home.md §1.2 y §2.
//
// UX principal: CÓDIGO de 6 dígitos (OTP). El usuario mete su email, recibe un
// email con un código, lo introduce y entra. `signInWithOtp` da de alta+verifica
// en un paso; `verifyEmailOtp` canjea el código por sesión sin salir de la app.
//
// FALLBACK (no romper login): el MISMO email que Supabase envía sigue llevando el
// enlace mágico de siempre. Si el usuario pulsa el enlace, `detectSessionInUrl`
// (ver supabase.ts) procesa el token y crea la sesión, igual que hasta ahora. Así,
// aunque la plantilla de email aún no incluya `{{ .Token }}` (el código), el login
// NO se rompe: el enlace sigue funcionando. En cuanto la plantilla añada el código,
// la vía de código queda operativa también. Ambas conviven sobre el mismo OTP.

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

// Envía el OTP por email. Supabase manda UN solo email que sirve para las dos
// vías: lleva el código (`{{ .Token }}`) Y el enlace mágico (`emailRedirectTo`).
//   - Vía código: el usuario copia el código de 6 dígitos y lo canjea con
//     `verifyEmailOtp` sin salir de la app.
//   - Vía enlace (fallback): pulsa el enlace y `detectSessionInUrl` crea la sesión.
// `shouldCreateUser: true` permite alta + login en el mismo flujo (passwordless).
//
// - `displayName`: si es el primer registro, viaja en `options.data.display_name`
//   y el trigger `handle_new_user` (migración 0004) lo usa como display_name
//   provisional del perfil. El paso de perfil del onboarding lo puede afinar luego.
// - `redirectTo`: a dónde vuelve el enlace mágico; por defecto el origin actual.
export async function sendEmailOtp(
  email: string,
  displayName?: string,
  redirectTo?: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Mantiene vivo el enlace mágico como fallback (no rompe el login actual).
      emailRedirectTo: redirectTo ?? defaultRedirect(),
      // Solo mandamos display_name si viene; así no pisamos con vacío el que ya
      // tuviera el usuario en un re-login.
      data: displayName ? { display_name: displayName } : undefined,
    },
  })
  if (error) throw error
}

// Canjea el código de 6 dígitos del email por una sesión, sin salir de la app.
// `type: 'email'` es el OTP que emite `signInWithOtp` para email. Al resolverse,
// `onAuthStateChange` dispara y AuthProvider repinta logueado.
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  })
  if (error) throw error
}

// Alias retrocompatible: el "magic link" no desaparece, es el mismo OTP. Lo
// mantenemos para no romper a quien aún importe este nombre.
export const signInWithMagicLink = sendEmailOtp

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
