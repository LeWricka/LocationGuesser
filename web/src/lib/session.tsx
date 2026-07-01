// AuthProvider: resuelve la sesión persistida al arrancar, se suscribe a los
// cambios (login/logout/refresh) y carga el perfil del usuario. Expone todo vía
// SessionContext para que cualquier pantalla use `useSession()`. El montaje en
// App.tsx lo hace la pieza #4; aquí solo el provider (lógica de sesión, sin UI
// propia más allá de envolver a sus hijos).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { onAuthStateChange, isVerifiedUser } from './auth'
import { getProfile } from './profile'
import type { Profile } from './database.types'
import { SessionContext, type SessionState } from './session-context'

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const user: User | null = session?.user ?? null

  // Recarga el perfil del usuario actual (o lo limpia si no hay sesión). Se llama
  // al cambiar de sesión y desde refreshProfile tras editar el perfil.
  const loadProfile = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null)
      return
    }
    const next = await getProfile(currentUser.id)
    setProfile(next)
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user ?? null)
  }, [loadProfile, session])

  useEffect(() => {
    let active = true

    // Arranque: la sesión está persistida en localStorage (ver supabase.ts).
    // getSession la resuelve sin red. Cargamos también el perfil antes de quitar
    // el loading para que la primera pintada no parpadee "sin perfil".
    async function bootstrap() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user ?? null)
      if (active) setLoading(false)
    }
    void bootstrap()

    // Cambios posteriores: login (incluido el callback del magic link que
    // detectSessionInUrl procesa), logout y refresh de token.
    const subscription = onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void loadProfile(nextSession?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // ¿Cuenta permanente con email validado? Gatea "crear" en la UI (issue #438).
  // Se deriva del user y cambia solo con él (onAuthStateChange repinta al validar).
  const verified = isVerifiedUser(user)

  const value = useMemo<SessionState>(
    () => ({ session, user, profile, loading, verified, refreshProfile }),
    [session, user, profile, loading, verified, refreshProfile],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
