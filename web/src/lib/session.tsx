// AuthProvider: resuelve la sesión persistida al arrancar, se suscribe a los
// cambios (login/logout/refresh) y carga el perfil del usuario. Expone todo vía
// SessionContext para que cualquier pantalla use `useSession()`. El montaje en
// App.tsx lo hace la pieza #4; aquí solo el provider (lógica de sesión, sin UI
// propia más allá de envolver a sus hijos).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

  // Espejo síncrono de `session` (además del estado) para poder comparar el
  // usuario ANTERIOR dentro del callback de `onAuthStateChange` sin depender de
  // una closure obsoleta ni de un efecto adicional. Ver su uso más abajo (causa
  // raíz de #647/#683/#720 — "refrescos y redirecciones al volver a la pestaña").
  const sessionRef = useRef<Session | null>(null)

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

    function applySession(next: Session | null) {
      sessionRef.current = next
      setSession(next)
    }

    // Arranque: la sesión está persistida en localStorage (ver supabase.ts).
    // getSession la resuelve sin red. Cargamos también el perfil antes de quitar
    // el loading para que la primera pintada no parpadee "sin perfil".
    async function bootstrap() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      // Sesión anónima del receptor (issue #758): es una sesión válida de
      // primera clase (ver docblock de `signInAnonymously` en lib/auth.ts), así
      // que la aplicamos igual que cualquier otra — sin el force-signOut que
      // hacía `clearLegacyAnonymousSession` (retirada).
      applySession(data.session)
      await loadProfile(data.session?.user ?? null)
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
    //
    // CAUSA RAÍZ de "refrescos y redirecciones al salir/entrar" (reincidente,
    // #647 → #683 → #720, ninguno la tocaba porque todos miraban el Service
    // Worker, no este listener): `@supabase/supabase-js` (GoTrueClient)
    // registra un `visibilitychange` propio y, en CADA vuelta de la pestaña a
    // visible, llama a `_recoverAndRefresh()` — que si la sesión en storage
    // sigue siendo válida (el caso normal: no ha expirado), emite un evento
    // `SIGNED_IN` con el MISMO usuario, no solo cuando el token realmente se
    // renueva (`TOKEN_REFRESHED`, que además también puede llegar por el mismo
    // camino). Es decir: CADA vez que sales y vuelves a la pestaña, este
    // callback se dispara con la MISMA identidad. Antes de este fix tratábamos
    // ese evento igual que un login real: `loading=true` hacía que `AppRoutes`
    // (App.tsx) desmontara TODO el árbol logueado (BootScreen) y lo remontara
    // de cero al terminar — perdiendo cualquier estado de UI que no viva en el
    // hash (la pestaña activa del viaje, un paso de asistente, una partida en
    // curso…). Eso es la "REDIRECCIÓN" reportada: vuelves y apareces en otra
    // pantalla aunque la URL nunca cambió, más el desmontaje visible por medio
    // ("refresco"). Confirmado con test en session.test.tsx (mismo patrón que
    // AppRoutes: `if (loading) <BootScreen/>`) y con el código de GoTrueClient
    // en node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
    // (`_onVisibilityChanged` → `_recoverAndRefresh` → `_notifyAllSubscribers`).
    //
    // Arreglo: si el evento trae el MISMO usuario que ya teníamos (revalidación,
    // no una transición real), actualizamos la sesión en el sitio, SIN loading
    // ni recarga de perfil — no hay BootScreen, no hay remount, no se pierde
    // nada. Solo pasamos por el camino "completo" (loading + perfil) cuando de
    // verdad cambia la identidad (login real, logout, cambio de cuenta).
    const subscription = onAuthStateChange((event, nextSession) => {
      const previousUserId = sessionRef.current?.user?.id ?? null
      const nextUserId = nextSession?.user?.id ?? null
      const sameUser = previousUserId !== null && previousUserId === nextUserId

      if (sameUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        applySession(nextSession)
        return
      }

      setLoading(true)
      applySession(nextSession)
      void loadProfile(nextSession?.user ?? null).finally(() => {
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
  // ¿Sesión anónima del receptor? (issue #758). La UI la usa para: no exigir
  // nombre al entrar por deep link, ofrecer el CTA "guárdate" tras jugar, y
  // esconder de "Miembros" a quien aún no ha hecho nada con ella.
  const isAnonymous = user?.is_anonymous === true

  const value = useMemo<SessionState>(
    () => ({ session, user, profile, loading, verified, isAnonymous, refreshProfile }),
    [session, user, profile, loading, verified, isAnonymous, refreshProfile],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
