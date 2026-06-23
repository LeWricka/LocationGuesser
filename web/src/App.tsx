// Raíz de la app con cuentas + home (cuentas-y-home.md §2 y §3.4). App es el
// INTEGRADOR del enrutado: monta <AuthProvider> y, dentro, un router por hash
// basado en sesión. Cada feature vive en su carpeta; App solo decide qué pantalla
// pintar según { sesión, perfil, hash }.
//
// Flujos (cuentas-y-home.md §2.2):
//  - loading                  → spinner de arranque
//  - sin sesión               → LoginFlow (con groupName si la URL trae #g)
//  - sesión sin nombre elegido → ProfileGate (paso de perfil del 1er login)
//  - sesión OK                → router por hash:
//       #g=&c=  → PlayChallenge (auto-join)
//       #g=     → GroupPage     (auto-join)
//       #nuevo  → CreateGroup
//       #perfil → ProfileEditScreen
//       raíz    → HomePage

import { useEffect, useState } from 'react'
import { CreateGroup } from './features/create/CreateGroup'
import { PlayChallenge } from './features/play/PlayChallenge'
import { GroupPage } from './features/group/GroupPage'
import { HomePage } from './features/home/HomePage'
import {
  LoginFlow,
  ProfileGate,
  ProfileEditScreen,
  useDeepLinkJoin,
  needsProfileStep,
} from './features/auth'
import { AuthProvider } from './lib/session'
import { useSession } from './lib/session-context'
import { useAnalyticsIdentity } from './lib/useAnalyticsIdentity'
import { setNextDestination, takeNextDestination } from './lib/auth'
import { getGroup } from './lib/groupData'
import { parseHash } from './lib/route'
import { Spinner, Stack, withViewTransition } from './ui'
import styles from './App.module.css'

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function AppRoutes() {
  const { user, profile, loading, refreshProfile } = useSession()
  const [route, setRoute] = useState(parseHash())

  // Analítica: identifica al usuario y emite login/signup_completed por sesión,
  // y resetea al cerrar sesión. Enganchado UNA vez, dentro del árbol con sesión.
  useAnalyticsIdentity()

  useEffect(() => {
    // Cross-fade nativo (View Transitions API) al cambiar de ruta; respeta
    // prefers-reduced-motion (withViewTransition cae a un setState directo).
    const onHash = () => withViewTransition(() => setRoute(parseHash()))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Arranque: resolviendo la sesión persistida.
  if (loading) return <BootScreen />

  // ── Sin sesión ──────────────────────────────────────────────────────────────
  // Cualquier ruta cae al login. Si la URL trae un deep link de grupo, guardamos
  // el destino para restaurarlo tras el email y mostramos el copy "Únete para
  // jugar este reto" con el nombre del grupo.
  if (!user) {
    return <LoggedOut route={route} />
  }

  // ── Sesión, pero falta elegir nombre (primer login) ──────────────────────────
  if (needsProfileStep(profile)) {
    return (
      <ProfileGate
        userId={user.id}
        initialName={profile?.display_name ?? ''}
        onDone={() => void refreshProfile()}
      />
    )
  }

  // ── Sesión + perfil OK ───────────────────────────────────────────────────────
  return <LoggedIn route={route} />
}

// Spinner de arranque, mientras AuthProvider resuelve la sesión persistida.
function BootScreen() {
  return (
    <main className={styles.boot}>
      <Stack gap={3} align="center">
        <Spinner size={32} />
      </Stack>
    </main>
  )
}

// Pantalla de login (sin sesión). Resuelve el nombre del grupo (barato: un select
// por id) cuando se entra por link de reto, y guarda el destino antes de salir al
// email para volver DIRECTO al reto (deep-link join al volver con sesión).
function LoggedOut({ route }: { route: ReturnType<typeof parseHash> }) {
  const [groupName, setGroupName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!route.group) return
    // Guardar el destino (hash completo) antes de pedir el email.
    setNextDestination(window.location.hash)
    let active = true
    void getGroup(route.group)
      .then((g) => {
        if (active && g) setGroupName(g.name ?? g.id)
      })
      // Si no podemos leer el nombre (RLS, red), caemos a copy genérico.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [route.group])

  return <LoginFlow groupName={groupName} />
}

// Router por hash con sesión válida. Auto-join idempotente al entrar por link de
// grupo y restauración del destino guardado al volver del email.
function LoggedIn({ route }: { route: ReturnType<typeof parseHash> }) {
  const { user, profile, refreshProfile } = useSession()
  const joinIfGroup = useDeepLinkJoin(user?.id)

  // Al volver del email: si guardamos un destino (#g…), lo restauramos (auto-join
  // + navegación). Lo consumimos una sola vez. Si el destino no era de grupo,
  // takeNextDestination devuelve algo no-grupo y joinIfGroup nos manda a la home.
  useEffect(() => {
    const next = takeNextDestination()
    if (next) void joinIfGroup(next)
  }, [joinIfGroup])

  // Flujo C (recurrente con sesión): al abrir directamente un link #g sin pasar
  // por el email, auto-join idempotente al grupo de la ruta actual.
  useEffect(() => {
    if (route.group && user?.id) void joinIfGroup(window.location.hash)
  }, [route.group, route.challenge, user?.id, joinIfGroup])

  // Reto concreto → jugar. Solo grupo → página del grupo. (El auto-join corre en
  // paralelo; la lectura ya exige ser miembro por RLS, por eso unimos primero.)
  if (route.challenge && route.group) {
    return <PlayChallenge challengeId={route.challenge} groupId={route.group} />
  }
  if (route.group) {
    return <GroupPage groupId={route.group} />
  }
  if (route.view === 'new') {
    return <CreateGroup onBack={() => goHome()} />
  }
  if (route.view === 'profile') {
    return (
      <ProfileEditScreen
        userId={user!.id}
        profile={profile}
        onSaved={refreshProfile}
        onBack={() => goHome()}
      />
    )
  }

  // Raíz sin hash → home/dashboard (centro de gravedad con sesión, §3).
  return <HomePage />
}

// Navegación por hash: cambiar location.hash dispara el listener de hashchange y
// repinta. La home es la raíz sin hash. Si ya estamos en raíz, forzamos el repintado
// con un hashchange manual (cambiar a '' no dispara el evento si ya está vacío).
function goHome() {
  if (window.location.hash) {
    window.location.hash = ''
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

export default App
