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
//       #admin  → AdminPage (SOLO admin; un no-admin cae a la home)
//       raíz    → HomePage

import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { CreateGroup } from './features/create/CreateGroup'
import { AddMoment } from './features/create/AddMoment'
import { CreateChallengeFlow } from './features/create/CreateChallengeFlow'
import { PlayChallenge } from './features/play/PlayChallenge'
import { GroupPage } from './features/group/GroupPage'
import { TripPage } from './features/trip/TripPage'
import { HomePage } from './features/home/HomePage'
import { AdminPage } from './features/admin'
import { isAdminEmail } from './lib/admin'
import {
  Landing,
  ProfileGate,
  ProfileEditScreen,
  useDeepLinkJoin,
  needsProfileStep,
} from './features/auth'
import { OnboardingGate, ReceptorWelcomeGate } from './features/onboarding'
import { AuthProvider } from './lib/session'
import { useSession } from './lib/session-context'
import { useAnalyticsIdentity } from './lib/useAnalyticsIdentity'
import { setNextDestination, takeNextDestination } from './lib/auth'
import { getGroup } from './lib/groupData'
import {
  parseHash,
  groupHash,
  classicGroupHash,
  addMomentHash,
  addChallengeHash,
} from './lib/route'
import { Icon, Spinner, Stack, withViewTransition } from './ui'
import styles from './App.module.css'

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

// ¿El hash es exactamente `#admin`? Es una vista atómica de la app, igual que
// `#nuevo`/`#perfil`, pero NO vive en route.ts (parseHash, área de lib): la
// gestiona App con la sesión a mano para gatear por email de admin.
function isAdminHash(hash: string = window.location.hash): boolean {
  return (hash.startsWith('#') ? hash.slice(1) : hash).trim() === 'admin'
}

function AppRoutes() {
  const { user, profile, loading, refreshProfile } = useSession()
  const [route, setRoute] = useState(parseHash())
  // El hash de admin se sigue aparte porque parseHash lo colapsa a la home; sin
  // este estado, navegar a `#admin` no repintaría (mismo valor de route).
  const [adminRoute, setAdminRoute] = useState(isAdminHash())

  // Analítica: identifica al usuario y emite login/signup_completed por sesión,
  // y resetea al cerrar sesión. Enganchado UNA vez, dentro del árbol con sesión.
  useAnalyticsIdentity()

  useEffect(() => {
    // Cross-fade nativo (View Transitions API) al cambiar de ruta; respeta
    // prefers-reduced-motion (withViewTransition cae a un setState directo).
    const onHash = () =>
      withViewTransition(() => {
        setRoute(parseHash())
        setAdminRoute(isAdminHash())
      })
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Arranque: resolviendo la sesión persistida.
  if (loading) return <BootScreen />

  // ── Sin sesión ──────────────────────────────────────────────────────────────
  // Cualquier ruta cae a la landing pública. Si la URL trae un deep link de
  // grupo, guardamos el destino para restaurarlo tras el email y adaptamos el
  // copy ("Únete a <grupo> y juega") con el nombre del grupo.
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
  return <LoggedIn route={route} adminRoute={adminRoute} />
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

// Landing pública (sin sesión). Resuelve el nombre del grupo (barato: un select
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

  return <Landing groupName={groupName} />
}

// Router por hash con sesión válida. Auto-join idempotente al entrar por link de
// grupo y restauración del destino guardado al volver del email.
function LoggedIn({
  route,
  adminRoute,
}: {
  route: ReturnType<typeof parseHash>
  adminRoute: boolean
}) {
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

  // `#admin`: pantalla de administración SOLO para el admin. Un no-admin que
  // fuerce el hash cae a la home (no ve nada de admin); aun así, las RPCs `admin_*`
  // deniegan en servidor. Tras los hooks (no condicionarlos) y antes del resto del
  // router: un deep link de grupo viaja por #g, nunca por #admin, así que no chocan.
  if (adminRoute) {
    if (isAdminEmail(user?.email)) return <AdminPage onBack={() => goHome()} />
    return <RedirectHome />
  }

  // Reto concreto → jugar. Solo grupo → página del grupo. (El auto-join corre en
  // paralelo; la lectura ya exige ser miembro por RLS, por eso unimos primero.)
  if (route.challenge && route.group) {
    return (
      <ReceptorWelcomeGate groupId={route.group} userId={user?.id}>
        <OnboardingGate context="challenge" userId={user?.id}>
          <PlayChallenge challengeId={route.challenge} groupId={route.group} />
        </OnboardingGate>
      </ReceptorWelcomeGate>
    )
  }
  if (route.group) {
    const groupId = route.group
    // FAB "＋" del viaje → flujo ligero "Añadir recuerdo" (separación contenido/reto):
    // un momento (foto/lugar/texto) sin reto por defecto, con el reto como capa
    // opcional. Al terminar (o cancelar) volvemos al viaje. Reemplaza el salto
    // directo al asistente de reto clásico.
    if (route.groupAddMoment) {
      return (
        <OnboardingGate context="add-moment" userId={user?.id}>
          <AddMoment
            groupId={groupId}
            onBack={() => {
              location.hash = groupHash(groupId)
            }}
            onCreated={() => {
              location.hash = groupHash(groupId)
            }}
          />
        </OnboardingGate>
      )
    }
    // FAB "Reto" del viaje → flujo INMERSIVO de crear reto (mapa satélite a sangre
    // + hoja que crece por etapas). Reemplaza al asistente clásico de 3 pasos. Al
    // crear, volvemos al reto recién lanzado (deep link) para ofrecer su enlace.
    if (route.groupAddChallenge) {
      return (
        <OnboardingGate context="create-challenge" userId={user?.id}>
          <CreateChallengeFlow
            groupId={groupId}
            onBack={() => {
              location.hash = groupHash(groupId)
            }}
            onCreated={(challenge) => {
              location.hash = groupHash(groupId, challenge.id)
            }}
          />
        </OnboardingGate>
      )
    }
    // Por defecto, un grupo abre la pantalla "Viaje" (diario visual). `v=clasico`
    // es el escape a la GroupPage de siempre (marcador, ajustes, fin de temporada),
    // accesible desde el botón "⋯" del viaje, así que NO se pierde nada de ella.
    if (route.groupView === 'clasico') {
      return (
        <ReceptorWelcomeGate groupId={groupId} userId={user?.id}>
          <OnboardingGate context="group" userId={user?.id}>
            <GroupPage
              groupId={groupId}
              onBack={() => {
                location.hash = groupHash(groupId)
              }}
            />
          </OnboardingGate>
        </ReceptorWelcomeGate>
      )
    }
    return (
      <ReceptorWelcomeGate groupId={groupId} userId={user?.id}>
        <OnboardingGate context="group" userId={user?.id}>
          <TripPage
            groupId={groupId}
            // "Adivina →": al flujo de juego EXISTENTE (#g=…&c=… → PlayChallenge).
            onPlayChallenge={(challengeId) => {
              location.hash = groupHash(groupId, challengeId)
            }}
            // "Añadir momento": al flujo ligero "Añadir recuerdo" (#g=…&add=recuerdo),
            // un momento sin reto por defecto (el reto es una capa opcional con toggle).
            onAddMoment={() => {
              location.hash = addMomentHash(groupId)
            }}
            // "Reto" (menú del FAB "＋"): al asistente de reto clásico (#g=…&v=clasico&add=1).
            onAddChallenge={() => {
              location.hash = addChallengeHash(groupId)
            }}
            // Acceso al marcador completo y ajustes, desde el pie de la sección Retos.
            onOpenClassic={() => {
              location.hash = classicGroupHash(groupId)
            }}
            onBack={() => goHome()}
          />
        </OnboardingGate>
      </ReceptorWelcomeGate>
    )
  }
  if (route.view === 'new') {
    return (
      <OnboardingGate context="create-trip" userId={user?.id}>
        <CreateGroup onBack={() => goHome()} />
      </OnboardingGate>
    )
  }
  if (route.view === 'profile') {
    return (
      <ProfileEditScreen
        userId={user!.id}
        profile={profile}
        onSaved={refreshProfile}
        onBack={() => goHome()}
        onOpenAdmin={
          isAdminEmail(user?.email)
            ? () => {
                location.hash = '#admin'
              }
            : undefined
        }
      />
    )
  }

  // Raíz sin hash → home/dashboard (centro de gravedad con sesión, §3). Para el
  // admin añadimos un acceso DISCRETO a `#admin` (un enlace flotante), invisible
  // para el resto. Solo en la home para no estorbar en grupo/jugar/perfil.
  return (
    <>
      <HomePage />
      {isAdminEmail(user?.email) && <AdminLink />}
    </>
  )
}

// Acceso discreto a la pantalla de administración, solo visible para el admin.
// Pastilla flotante abajo-izquierda (la derecha la ocupa el FAB de crear grupo).
function AdminLink() {
  return (
    <a className={styles.adminLink} href="#admin" aria-label="Abrir administración">
      <Icon icon={Settings} size={18} /> Admin
    </a>
  )
}

// Redirige a la home limpiando el hash (p.ej. un no-admin en `#admin`). El
// borrado va en un efecto para no mutar location durante el render; mientras,
// pintamos la home para no dejar la pantalla en blanco.
function RedirectHome() {
  useEffect(() => {
    goHome()
  }, [])
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
