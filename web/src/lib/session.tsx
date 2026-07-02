// AuthProvider: resuelve la sesión persistida al arrancar, se suscribe a los
// cambios (login/logout/refresh) y carga el perfil del usuario. Expone todo vía
// SessionContext para que cualquier pantalla use `useSession()`. El montaje en
// App.tsx lo hace la pieza #4; aquí solo el provider (lógica de sesión, sin UI
// propia más allá de envolver a sus hijos).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { onAuthStateChange, isVerifiedUser, clearLegacyAnonymousSession } from './auth'
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
      // Sesión anónima legada (issue #514): el modelo pre-#507 dejó sesiones
      // anónimas vivas en localStorage que ya no sirven (la RLS de groups exige
      // is_anonymous=false). Las descartamos aquí, ANTES de pintar nada logueado.
      const legacy = await clearLegacyAnonymousSession(data.session)
      if (!active) return
      const validSession = legacy ? null : data.session
      setSession(validSession)
      await loadProfile(validSession?.user ?? null)
      if (active) setLoading(false)
    }
    void bootstrap()

    // Cambios posteriores: login (incluido el callback del magic link que
    // detectSessionInUrl procesa), logout y refresh de token.
    //
    // IMPORTANTE (bug #495): ponemos loading:true durante la carga del perfil para
    // que App no intente renderizar el árbol logueado con profile=null (transitorio).
    // Sin este flag, onAuthStateChange seteaba session (con user) pero profile aún era
    // null → needsProfileStep(null)=true → ProfileGate aparecía un instante para
    // usuarios que SÍ tienen perfil (p.ej. vuelven por magic link). Con loading:true
    // App muestra BootScreen hasta que el perfil esté disponible: sin parpadeo.
    const subscription = onAuthStateChange((_event, nextSession) => {
      setLoading(true)
      void clearLegacyAnonymousSession(nextSession)
        .then((legacy) => {
          if (!active) return
          const validSession = legacy ? null : nextSession
          setSession(validSession)
          return loadProfile(validSession?.user ?? null)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
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
