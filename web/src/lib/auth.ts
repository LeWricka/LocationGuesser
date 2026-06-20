// Capa de auth: helpers tipados sobre supabase.auth, agnósticos al método de
// login. Tanto el magic link (OTP por email) como OAuth con Google crean una
// fila en auth.users, así que `auth.uid()` y `groups.created_by` funcionan
// igual para ambos. Sin UI: solo lógica de sesión para que la presentación
// (otro agente) la consuma.

import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// A dónde vuelve el usuario tras pulsar el magic link / completar OAuth. Usamos
// el origin actual para que funcione igual en localhost y en prod sin tener que
// hardcodear el dominio. `detectSessionInUrl` (ver supabase.ts) procesa el
// token al aterrizar aquí.
function redirectUrl(): string {
  return window.location.origin
}

// Login por magic link: Supabase manda un email con un enlace; al abrirlo, el
// cliente detecta el token en la URL y crea la sesión. No hay contraseña.
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl() },
  })
  if (error) throw error
}

// Login con Google (OAuth). Redirige al consentimiento de Google y vuelve al
// origin con la sesión ya establecida.
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUrl() },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Sesión actual (o null si no hay login). Útil para el gating: antes de crear
// un grupo/reto, asegurarse de que existe sesión.
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

// Usuario actual (o null). `user.id` es el uuid que va a `groups.created_by`.
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
