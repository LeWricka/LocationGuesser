// Capa de auth: helpers tipados sobre supabase.auth, sin UI. La presentación
// (features/auth) los consume. La política del hito es passwordless puro
// (email); ver cuentas-y-home.md §1.2 y §2.
//
// MODELO EMAIL-FIRST CON CÓDIGO (issue #506):
//   Una sola entrada para nuevo y recurrente → `signInWithOtp({ shouldCreateUser: true })`.
//   Supabase manda UN email con código de 6 dígitos + enlace mágico (fallback).
//   Canjear el código: `verifyEmailOtp(email, code)`. Al verificar, Supabase crea
//   o recupera la cuenta permanente (no anónima). Luego App detecta si el perfil
//   tiene nombre (cuenta existente → HOME directo) o no (cuenta nueva → paso nombre).
//
// FALLBACK: el MISMO email que Supabase envía lleva el enlace mágico de siempre.
//   Si el usuario pulsa el enlace, `detectSessionInUrl` (ver supabase.ts) procesa
//   el token y crea la sesión, igual que hasta ahora. Ambas vías conviven.

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
// Funciona para NUEVOS y para usuarios EXISTENTES: Supabase lo detecta solo.
//
// - `displayName`: si es el primer registro, viaja en `options.data.display_name`
//   y el trigger `handle_new_user` (migración 0004) lo usa como display_name
//   provisional del perfil. En el nuevo modelo de entrada email-first NO mandamos
//   nombre aquí: la verificación OTP crea la sesión, y App detecta si hay nombre.
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

// Alias retrocompatible: el "magic link" no desaparece, es el mismo OTP. Lo
// mantenemos para no romper a quien aún importe este nombre.
export const signInWithMagicLink = sendEmailOtp

// Canjea el código de 6 dígitos del email por una sesión, sin salir de la app.
// `type: 'email'` es el OTP que emite `signInWithOtp` para email. Al resolverse,
// `onAuthStateChange` dispara y AuthProvider repinta logueado.
// Con `shouldCreateUser: true` en el OTP, Supabase crea el usuario si no existe
// o inicia sesión en la cuenta existente — transparente para el llamante.
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  })
  if (error) throw error
}

/**
 * ¿El usuario tiene una cuenta PERMANENTE con email VALIDADO? Es el flag que
 * indica que el usuario está completamente autenticado (no anónimo, email confirmado).
 *
 * Con el modelo email-first con código OTP, cualquier usuario que haya verificado
 * su código tiene `is_anonymous = false` y `email_confirmed_at` puesto. El flag
 * `verified` en SessionContext se deriva de aquí.
 *
 * Nota: la seguridad real la impone la RLS `groups_insert_owner`; este flag es
 * solo para la UI.
 */
export function isVerifiedUser(user: User | null): boolean {
  if (!user) return false
  if (user.is_anonymous === true) return false
  return Boolean(user.email_confirmed_at)
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ── Sesión anónima del RECEPTOR (issue #758) ─────────────────────────────────
// #507 eliminó la entrada anónima como modelo de ALTA general (esa vía sigue
// siendo email-first con código, arriba en este fichero). Pero un RECEPTOR que
// abre un enlace compartido (viaje/reto) debe poder VER y JUGAR sin dar ni un
// dato: le damos una sesión anónima de Supabase Auth, acotada a ese enlace. Su
// `auth.uid()` es real desde el primer segundo, así que su voto cuenta aunque
// nunca deje su email; `isVerifiedUser` (arriba) sigue siendo el candado de
// CAPACIDADES (crear un viaje exige is_anonymous=false, migración 0032), no de
// acceso a la sesión: un anónimo SÍ tiene sesión, solo no puede crear.
//
// Antes (issue #514) tratábamos CUALQUIER sesión anónima como "legada" (del
// modelo pre-#507) y la cerrábamos a la fuerza en el arranque
// (`clearLegacyAnonymousSession`, retirada). Con las sesiones anónimas de
// vuelta como ciudadanas de primera clase para el receptor, ese force-signOut
// ya no tiene sentido: cerrar sesión a un receptor a mitad de partida le haría
// perder su sesión (y con ella, la identidad de su voto) sin motivo. Se retiró
// junto con el aviso "hemos mejorado el acceso" en Landing.

/**
 * Entra como usuario ANÓNIMO (Supabase Auth). Lo usa el router (App.tsx) cuando
 * alguien sin sesión abre un enlace de viaje/reto: le da una identidad real
 * (`auth.uid()`) sin pedirle nada. DEGRADA CON ELEGANCIA: si Supabase devuelve
 * error (p.ej. el toggle "Allow anonymous sign-ins" está apagado en el
 * dashboard, ver docs/operativa.md) NO lanzamos — devolvemos el error para que
 * el llamante caiga al flujo de hoy (Landing + código OTP). Nunca debe dejar la
 * pantalla en blanco ni romper la app.
 */
export async function signInAnonymously(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signInAnonymously()
    return { error: error ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}

// ── Vincular anónimo → cuenta permanente (issue #758) ────────────────────────
// "Guárdate / entra del todo": el receptor anónimo que ya vio/jugó puede, al
// final y de forma OPCIONAL, convertir su sesión anónima en una cuenta
// permanente con email SIN perder identidad — el `auth.uid()` (y con él, sus
// votos y su puesto en el marcador) no cambia. Es un flujo DISTINTO de
// `sendEmailOtp`/`verifyEmailOtp` (que crean o recuperan una cuenta desde
// cero): aquí NO hay `signInWithOtp` de por medio, es `updateUser({ email })`
// sobre la sesión anónima ya existente, que Supabase trata como un cambio de
// email (manda un código/enlace de tipo `email_change`) y, al verificarlo, la
// cuenta deja de ser anónima conservando el mismo id.
export async function linkAnonymousEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email })
  if (error) throw error
}

/**
 * Canjea el código de 6 dígitos del paso anterior. `type: 'email_change'` es
 * el tipo de OTP que emite `updateUser({ email })` sobre una sesión ya
 * iniciada (a diferencia de `verifyEmailOtp`, que usa `type: 'email'` para el
 * alta/login desde cero vía `signInWithOtp`). Al verificar, `is_anonymous` pasa
 * a `false` y `onAuthStateChange` repinta con la cuenta ya permanente.
 */
export async function verifyLinkEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email_change',
  })
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
