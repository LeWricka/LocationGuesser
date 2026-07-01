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

// ── Modelo de entrada de baja fricción (issue #438) ──────────────────────────
// Entrar = nombre + email → DENTRO al instante, sin esperar código. Bajo el capó:
//   1. signInAnonymously() si no hay sesión (sesión anónima; el user_id es de por vida).
//   2. updateUser({ data: { display_name } }) → nombre en el metadata del usuario.
//   3. updateUser({ email }) → ENLAZA el email al MISMO user_id y dispara el correo de
//      validación; la sesión anónima sigue viva con el email PENDIENTE.
// Ver/jugar/unirse: permitido con email pendiente. CREAR viaje: exige email VALIDADO
// (a nivel BD lo cierra la RLS `groups_insert_owner` de la migración 0032).
//
// Fuentes SDK (confirmadas): updateUser({email}) es el método correcto (linkIdentity es
// solo OAuth); conserva `sub`/user.id; devuelve error.code === 'email_exists' si el email
// ya pertenece a otra cuenta; requiere "Anonymous sign-ins" activo en el dashboard.
// Bug conocido supabase#29350: updateUser({email}) puede marcar is_anonymous=false y
// email_confirmed_at al instante (antes de confirmar). Por eso NUNCA confiamos en el
// cliente para la SEGURIDAD (eso es RLS); `isVerifiedUser` es solo para gatear la UI.

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

// ── Entrada de baja fricción: nombre + email → dentro al instante (issue #438) ─

/** Resultado de `enterWithNameAndEmail`, para que la UI decida el siguiente paso. */
export type EnterResult =
  | { kind: 'entered' } // dentro con email pendiente de validar (caso normal)
  | { kind: 'email-exists' } // el email ya es de otra cuenta → se mandó magic link de recuperación

/**
 * Marca `email_exists` de Supabase: `updateUser({email})` con un correo que ya
 * pertenece a OTRA cuenta. Comprobamos por `code` (estable), no por el mensaje
 * (Supabase lo oculta parcialmente por privacidad).
 */
function isEmailExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (code === 'email_exists' || code === 'user_already_exists') return true
  // Respaldo defensivo: algunas versiones no rellenan `code`. Miramos el mensaje.
  const message = (error as { message?: string }).message?.toLowerCase() ?? ''
  return message.includes('already') && message.includes('email')
}

/**
 * Entra al instante con nombre + email (issue #438). Crea (o reutiliza) una sesión
 * anónima, le pone el `display_name` y le ENLAZA el email (dispara la validación
 * por correo, pero NO bloquea: la sesión anónima sigue viva con el email pendiente).
 *
 * CASO BORDE CRÍTICO — email ya registrado: si el correo ya es de OTRA cuenta,
 * enlazarlo a un anónimo nuevo fallaría (`email_exists`). En ese caso NO rompemos:
 * mandamos un magic link de RECUPERACIÓN a ese correo (reusa `sendEmailOtp`) para
 * que el usuario recupere SU cuenta desde el enlace. Devolvemos 'email-exists' para
 * que la UI muestre "te mandamos un enlace para recuperar tu cuenta".
 *
 * `redirectTo`: a dónde vuelve el enlace de validación/recuperación (por defecto el
 * origin). Cualquier error de red se propaga para que la UI lo muestre (no cuelga).
 */
export async function enterWithNameAndEmail(
  name: string,
  email: string,
  redirectTo?: string,
): Promise<EnterResult> {
  const cleanEmail = email.trim()
  const cleanName = name.trim()

  // 1. Sesión anónima si aún no hay ninguna. Si ya hay sesión (p.ej. el usuario
  //    reintenta), la reutilizamos: no creamos un anónimo nuevo ni perdemos datos.
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }

  // 2. Nombre: al metadata del usuario Y a la fila de profiles. Lo escribimos en
  //    AMBOS porque el trigger handle_new_user crea el perfil al nacer el anónimo
  //    (cuando aún NO hay nombre ni email), así que quedaría con display_name vacío
  //    y ProfileGate lo volvería a pedir. Upsertando aquí, el nombre capturado en la
  //    entrada persiste y el paso de perfil se salta (issue #438, punto 6).
  if (cleanName) {
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { display_name: cleanName },
    })
    if (metaErr) throw metaErr

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (userId) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: cleanName }, { onConflict: 'id' })
      if (profileErr) throw profileErr
    }
  }

  // 3. Enlazar el email al MISMO user_id → dispara el correo de validación. La
  //    sesión anónima sigue viva con el email pendiente (ver/jugar/unirse siguen OK).
  const { error } = await supabase.auth.updateUser(
    { email: cleanEmail },
    { emailRedirectTo: redirectTo ?? defaultRedirect() },
  )
  if (error) {
    // Email de OTRA cuenta: no enlazamos; mandamos magic link de recuperación.
    if (isEmailExistsError(error)) {
      await sendEmailOtp(cleanEmail, undefined, redirectTo)
      return { kind: 'email-exists' }
    }
    throw error
  }
  return { kind: 'entered' }
}

/**
 * Reenvía el correo de validación del email PENDIENTE del usuario actual. Reusa
 * `updateUser({email})` con el mismo correo (idempotente: reenvía el enlace). Lo
 * usa el gate de "valida tu correo para crear" (botón "Reenviar correo").
 */
export async function resendEmailValidation(redirectTo?: string): Promise<void> {
  const { data, error: getErr } = await supabase.auth.getUser()
  if (getErr) throw getErr
  const email = data.user?.email
  if (!email) throw new Error('No hay un correo pendiente de validar en la sesión.')
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: redirectTo ?? defaultRedirect() },
  )
  if (error) throw error
}

/**
 * ¿El usuario tiene una cuenta PERMANENTE con email VALIDADO? Es el flag que gatea
 * "crear viaje" en la UI. Verificado = NO anónimo Y con `email_confirmed_at`.
 *
 * Nota de prudencia (bug supabase#29350): el cliente puede reportar mal el estado
 * tras `updateUser({email})`. Por eso este flag es SOLO para la UI; la seguridad
 * real la impone la RLS `groups_insert_owner` (exige `is_anonymous = false` en el
 * JWT). Exigimos ambas condiciones para no abrir el gate antes de tiempo: un
 * anónimo (is_anonymous true) nunca pasa aunque email_confirmed_at estuviera puesto.
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
