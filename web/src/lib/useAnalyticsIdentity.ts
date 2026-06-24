// Identidad de analítica por sesión. Engancha la sesión de Supabase con Mixpanel
// y Sentry: cuando hay usuario, lo identifica (id estable = uuid de Auth) y emite
// `login` / `signup_completed`; al cerrar sesión, resetea. Se monta UNA vez en
// App.tsx, dentro del árbol con <AuthProvider> (usa useSession()).

import { useEffect, useRef } from 'react'
import { useSession } from './session-context'
import { identifyUser, resetAnalytics, track } from './analytics'
import { clearObservabilityUser, setObservabilityUser } from './observability'

// Margen para considerar un sign-in como ALTA y no como login recurrente: en el
// alta por magic link, `created_at` y `last_sign_in_at` distan pocos segundos.
const SIGNUP_WINDOW_MS = 10_000

// ¿Es este sign-in el primero del usuario? (alta, no login recurrente). En el
// alta, la creación de la cuenta y el primer sign-in ocurren casi a la vez.
function isFreshSignup(createdAt?: string, lastSignInAt?: string): boolean {
  if (!createdAt || !lastSignInAt) return false
  const created = Date.parse(createdAt)
  const lastSignIn = Date.parse(lastSignInAt)
  if (Number.isNaN(created) || Number.isNaN(lastSignIn)) return false
  return Math.abs(lastSignIn - created) <= SIGNUP_WINDOW_MS
}

export function useAnalyticsIdentity(): void {
  const { user, profile } = useSession()
  // Evita re-emitir login/identify en cada repintado: solo al cambiar de usuario
  // (o entre login y logout). Guardamos el último id procesado.
  const lastIdentified = useRef<string | null>(null)

  useEffect(() => {
    if (!user) {
      // Logout (había alguien identificado y ahora no): desvincular en ambos.
      if (lastIdentified.current) {
        resetAnalytics()
        clearObservabilityUser()
        lastIdentified.current = null
      }
      return
    }

    // Mismo usuario ya identificado en esta sesión → nada que hacer.
    if (lastIdentified.current === user.id) return

    lastIdentified.current = user.id
    identifyUser({
      id: user.id,
      email: user.email,
      name: profile?.display_name,
      avatar: profile?.avatar_url,
    })
    // Sentry: asociar los errores al usuario (el id estable basta).
    setObservabilityUser(user.id)

    // Alta (primer sign-in) vs login recurrente: una u otra, no ambas.
    if (isFreshSignup(user.created_at, user.last_sign_in_at)) {
      track('signup_completed')
    } else {
      track('login')
    }
    // `profile` puede llegar después del user; no queremos re-disparar login por
    // eso (el efecto de abajo se encarga de actualizar el nombre/avatar). Un
    // cambio de display_name no debe contar como nuevo login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // BUG (#166): el efecto de arriba corre con deps `[user]`, pero `profile`
  // (con `display_name`) suele cargar DESPUÉS del `user`, así que el primer
  // `identifyUser` va con `name: undefined` y Mixpanel se queda sin nombre.
  // FIX: al estar disponible el perfil, reidentificamos (es idempotente: el id
  // no cambia, solo actualiza `$name`/`avatar`). NO emitimos login/signup aquí.
  useEffect(() => {
    if (!user || !profile?.display_name) return
    identifyUser({
      id: user.id,
      email: user.email,
      name: profile.display_name,
      avatar: profile.avatar_url,
    })
  }, [user, profile?.display_name, profile?.avatar_url])
}
