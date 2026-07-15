// Raíz de la app con cuentas + home (cuentas-y-home.md §2 y §3.4). App es el
// INTEGRADOR del enrutado: monta <AuthProvider> y, dentro, un router por hash
// basado en sesión. Cada feature vive en su carpeta; App solo decide qué pantalla
// pintar según { sesión, hash }.
//
// Flujos (email-first con código OTP, issue #506):
//  - loading                  → spinner de arranque
//  - sin sesión, deep link    → AnonReceptorGate: auto sign-in ANÓNIMO (#758);
//                                si falla, cae a Landing
//  - sin sesión, sin deep link→ Landing (CTA único email-first → LoginFlow)
//  - sesión OK, sin nombre    → ProfileGate (paso de nombre) → HOME (issue #742)
//  - sesión OK, con nombre    → router por hash:
//       #g=&c=  → PlayChallenge (auto-join)          [permitido sin nombre también]
//       #g=     → TripPage     (auto-join)            [permitido sin nombre también]
//       #nuevo  → CreateGroup (con sesión OTP verificada, sin muro adicional);
//                 un ANÓNIMO ve el CTA "guárdate" en vez del formulario (#758)
//       #perfil → ProfileEditScreen  (acceso BAJO DEMANDA; no como puerta de entrada)
//       #admin  → AdminPage (SOLO admin; un no-admin cae a la home)
//       raíz    → HomePage
//
// CreateGate ELIMINADO (issue #506): con OTP, cualquier usuario que verifica su
// código tiene sesión permanente (no anónima) y puede crear directo. La RLS
// `groups_insert_owner` sigue siendo el candado real en BD.
//
// ProfileGate: solo se muestra a cuentas NUEVAS (sin display_name) como parte del
// alta, tras el código. Una vez elegido el nombre, no vuelve a aparecer.
// La edición de perfil es accesible bajo demanda vía #perfil, no como paso forzado.
//
// RECEPTOR SIN CUENTA (issue #758, enfoque A): quien abre un enlace de
// viaje/reto SIN sesión ya no cae directo a la Landing/email — primero
// intentamos darle una sesión ANÓNIMA (`signInAnonymously`, lib/auth.ts). Con
// ella ve y juega el reto (el auto-join de `LoggedIn` ya lo da de alta como
// miembro) sin dar ni un dato; el nombre solo se le pide al votar
// (PlayChallenge) y el email es un CTA opcional tras jugar o al intentar crear
// (AccountUpgradeModal). Si el sign-in anónimo falla (toggle "Allow anonymous
// sign-ins" apagado en el dashboard, ver docs/operativa.md), degradamos con
// gracia al flujo de hoy (Landing + código OTP): nunca pantalla en blanco.

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { isAdminEmail } from './lib/admin'
import {
  AccountUpgradeModal,
  Landing,
  ProfileGate,
  useDeepLinkJoin,
  needsProfileStep,
} from './features/auth'
import { ReceptorWelcomeGate } from './features/onboarding'
import { AuthProvider } from './lib/session'
import { useSession } from './lib/session-context'
import { useAnalyticsIdentity } from './lib/useAnalyticsIdentity'
import { GoogleMapsProvider } from './lib/GoogleMapsProvider'
import { setNextDestination, takeNextDestination, signInAnonymously } from './lib/auth'
import { getGroup } from './lib/groupData'
import { track } from './lib/analytics'
import { reportError } from './lib/observability'
import { parseHash, groupHash, addMomentHash, addChallengeHash } from './lib/route'
import {
  BackHomeButton,
  Card,
  Icon,
  Spinner,
  Stack,
  withViewTransition,
  TripRouteSkeleton,
  PlayRouteSkeleton,
  UtilityRouteSkeleton,
  HomeRouteSkeleton,
  useToast,
} from './ui'
import styles from './App.module.css'

// CODE-SPLITTING POR RUTA (perf): las pantallas pesadas (mapas Leaflet/Google,
// flujos de crear/jugar) se cargan con React.lazy → Vite las separa en chunks que
// solo se descargan al navegar a ellas. El bundle inicial deja de arrastrar
// features + Leaflet; la landing (Landing, importada estática arriba) solo carga
// lo suyo. Cada ruta lazy tiene su PROPIO <Suspense> con el skeleton de su
// familia (issue #526): así cada navegación anticipa el layout que llega, en vez
// de resetear la sensación de fluidez con un spinner genérico. BootScreen queda
// reservado solo para el arranque de sesión (línea `if (loading) …` más abajo).
const CreateGroup = lazy(() =>
  import('./features/create/CreateGroup').then((m) => ({ default: m.CreateGroup })),
)
const AddMoment = lazy(() =>
  import('./features/create/AddMoment').then((m) => ({ default: m.AddMoment })),
)
const CreateChallengeFlow = lazy(() =>
  import('./features/create/CreateChallengeFlow').then((m) => ({ default: m.CreateChallengeFlow })),
)
const PlayChallenge = lazy(() =>
  import('./features/play/PlayChallenge').then((m) => ({ default: m.PlayChallenge })),
)
const TripPage = lazy(() =>
  import('./features/trip/TripPage').then((m) => ({ default: m.TripPage })),
)
const HomePage = lazy(() =>
  import('./features/home/HomePage').then((m) => ({ default: m.HomePage })),
)
const ProfileEditScreen = lazy(() =>
  import('./features/auth/ProfileEditScreen').then((m) => ({ default: m.ProfileEditScreen })),
)
const AdminPage = lazy(() => import('./features/admin').then((m) => ({ default: m.AdminPage })))

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
  const { user, loading } = useSession()
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

  // Arranque: resolviendo la sesión persistida O cargando el perfil tras onAuthStateChange.
  // Con el fix de session.tsx, loading cubre ambas situaciones: arranque inicial y los
  // instantes en que onAuthStateChange dispara y el perfil aún no ha llegado.
  if (loading) return <BootScreen />

  // ── Sin sesión ──────────────────────────────────────────────────────────────
  // Un deep link de viaje/reto intenta ANTES una sesión anónima (issue #758):
  // el receptor ve/juega sin dar ningún dato. Sin deep link (home a secas) cae
  // directo a la landing pública de siempre.
  if (!user) {
    if (route.group) {
      return <AnonReceptorGate route={route} />
    }
    return <LoggedOut route={route} />
  }

  // ── Sesión OK → router por hash ──────────────────────────────────────────────
  return <LoggedIn route={route} adminRoute={adminRoute} />
}

// Deep link SIN sesión (issue #758): antes de caer a la Landing, intentamos dar
// una sesión ANÓNIMA al receptor para que vea/juegue sin dar ni un dato.
// Mientras se resuelve, el esqueleto de la pantalla de destino (no un spinner
// genérico: issue #526, cada ruta anticipa su propia forma). Éxito →
// `onAuthStateChange` dispara, `AuthProvider` actualiza `user` y `AppRoutes`
// vuelve a evaluar con sesión — este componente se desmonta solo, no navega él
// mismo. Fallo (p.ej. el toggle "Allow anonymous sign-ins" está apagado en el
// dashboard) → degradación con gracia a la Landing/login de siempre.
function AnonReceptorGate({ route }: { route: ReturnType<typeof parseHash> }) {
  const [failed, setFailed] = useState(false)
  // Evita relanzar el sign-in en cada re-render (p.ej. si `route` cambia de
  // identidad por un hashchange mientras la promesa sigue en vuelo).
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    const kind = route.challenge ? 'challenge' : 'trip'
    // group_id/challenge_id (issue #751): no son sensibles (ya viajan en el
    // resto de eventos del funnel) y sin ellos no se puede cruzar este intento
    // con lo que pasa después en el mismo viaje/reto.
    const ids = {
      group_id: route.group,
      ...(route.challenge && { challenge_id: route.challenge }),
    }
    void signInAnonymously().then(({ error }) => {
      if (error) {
        reportError(error, { area: 'receptor_anon_signin' })
        track('receptor_anon_signin', { outcome: 'failed', kind, ...ids })
        setFailed(true)
        return
      }
      track('receptor_anon_signin', { outcome: 'success', kind, ...ids })
    })
  }, [route.challenge, route.group])

  if (failed) return <LoggedOut route={route} />
  return route.challenge ? <PlayRouteSkeleton /> : <TripRouteSkeleton />
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
  const { user, profile, isAnonymous, refreshProfile } = useSession()
  const joinIfGroup = useDeepLinkJoin(user?.id, isAnonymous)

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
    if (isAdminEmail(user?.email))
      return (
        <Suspense fallback={<UtilityRouteSkeleton />}>
          <AdminPage onBack={() => goHome()} />
        </Suspense>
      )
    return <RedirectHome />
  }

  // ProfileGate: solo para cuentas NUEVAS que no tienen nombre aún (issue #506).
  // Al entrar con OTP por primera vez, el perfil existe (trigger lo crea) pero
  // display_name puede estar vacío. Pedimos el nombre UNA sola vez; tras guardarlo,
  // refreshProfile actualiza el contexto y este bloque deja de ejecutarse.
  // EXCEPCIÓN: rutas #g= y #g=&c= (ver/jugar) NO requieren nombre para acceder.
  // El usuario puede ver y jugar sin nombre; solo la home y crear lo requieren.
  if (needsProfileStep(profile) && !route.group && !adminRoute) {
    return (
      <ProfileGate
        userId={user!.id}
        initialName={profile?.display_name ?? ''}
        // Tras capturar el nombre, aterrizar SIEMPRE en la HOME (issue #742): el
        // paso de nombre NO es "el perfil" ni una puerta a él. Refrescamos el
        // perfil y limpiamos el hash para caer en la home (vacía si aún no hay
        // viajes); el editor de perfil queda accesible solo bajo demanda (avatar →
        // #perfil), nunca como paso obligado del alta.
        onDone={() => {
          refreshProfile()
          goHome()
        }}
      />
    )
  }

  // Reto concreto → jugar. Solo grupo → página del grupo. (El auto-join corre en
  // paralelo; la lectura ya exige ser miembro por RLS, por eso unimos primero.)
  if (route.challenge && route.group) {
    return (
      <ReceptorWelcomeGate
        groupId={route.group}
        userId={user?.id}
        profileOnboarding={profile?.onboarding}
      >
        <GoogleMapsProvider>
          <Suspense fallback={<PlayRouteSkeleton />}>
            <PlayChallenge challengeId={route.challenge} groupId={route.group} />
          </Suspense>
        </GoogleMapsProvider>
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
        <GoogleMapsProvider>
          <Suspense fallback={<UtilityRouteSkeleton />}>
            <AddMoment
              groupId={groupId}
              onBack={() => {
                location.hash = groupHash(groupId)
              }}
              onCreated={() => {
                location.hash = groupHash(groupId)
              }}
              // "Añadir reto" desde el recuerdo guardado: al formulario de reto con la
              // foto y el lugar del recuerdo pre-rellenados (`&from=<momentId>`).
              onAddChallenge={(momentId) => {
                location.hash = addChallengeHash(groupId, momentId)
              }}
            />
          </Suspense>
        </GoogleMapsProvider>
      )
    }
    // FAB "Reto" del viaje → flujo INMERSIVO de crear reto (mapa satélite a sangre
    // + hoja que crece por etapas). Reemplaza al asistente clásico de 3 pasos. Al
    // crear, volvemos al viaje (diario): el creador no debe acabar jugando su
    // propio reto (#509); el enlace para compartir se ofrece desde el viaje.
    if (route.groupAddChallenge) {
      return (
        <GoogleMapsProvider>
          <Suspense fallback={<UtilityRouteSkeleton />}>
            <CreateChallengeFlow
              groupId={groupId}
              // Si el reto nace de un recuerdo (`&from=<id>`), pre-rellena foto y lugar.
              fromMomentId={route.groupChallengeFrom}
              // Promoción de un recuerdo YA guardado (`&promote=<id>`, issue #723):
              // mismo asistente prefijado, pero el recuerdo SE CONVIERTE (no se duplica).
              promoteMomentId={route.groupChallengePromote}
              onBack={() => {
                location.hash = groupHash(groupId)
              }}
              // El creador NO debe acabar jugando su propio reto (#509): tras crear,
              // volvemos al viaje (diario), no al reto recién creado.
              onCreated={() => {
                location.hash = groupHash(groupId)
              }}
            />
          </Suspense>
        </GoogleMapsProvider>
      )
    }
    // UNA vista por viaje: el grupo SIEMPRE abre la pantalla "Viaje", que tiene TRES
    // secciones con un tab (Diario · Fotos · Marcador, issue #645). El marcador
    // completo + gestión ya no es una pantalla suelta: es una pestaña del propio
    // viaje (GroupPage incrustada). Los enlaces viejos `#g=…&v=clasico` aterrizan
    // en esa pestaña (`groupView === 'marcador'`), así que no se rompe nada.
    return (
      <ReceptorWelcomeGate
        groupId={groupId}
        userId={user?.id}
        profileOnboarding={profile?.onboarding}
      >
        {/* La pestaña "Marcador" del viaje incrusta GroupPage (mapa de aciertos
            con Google Maps) y EditChallenge (preview Street View); por eso el
            viaje necesita el provider de Maps. */}
        <GoogleMapsProvider>
          <Suspense fallback={<TripRouteSkeleton />}>
            <TripPage
              groupId={groupId}
              // Sección inicial: "Marcador" o "Fotos" si el enlace lo pide (legado
              // v=clasico / v=marcador, o v=fotos), si no "Diario".
              initialSection={
                route.groupView === 'marcador'
                  ? 'marcador'
                  : route.groupView === 'fotos'
                    ? 'fotos'
                    : 'diario'
              }
              // "Adivina →": al flujo de juego EXISTENTE (#g=…&c=… → PlayChallenge).
              onPlayChallenge={(challengeId) => {
                location.hash = groupHash(groupId, challengeId)
              }}
              // "Añadir momento": al flujo ligero "Añadir recuerdo" (#g=…&add=recuerdo),
              // un momento sin reto por defecto (el reto es una capa opcional con toggle).
              onAddMoment={() => {
                location.hash = addMomentHash(groupId)
              }}
              // "Reto" (menú del FAB "＋"): al flujo inmersivo de crear reto (#g=…&add=reto).
              onAddChallenge={() => {
                location.hash = addChallengeHash(groupId)
              }}
              onBack={() => goHome()}
            />
          </Suspense>
        </GoogleMapsProvider>
      </ReceptorWelcomeGate>
    )
  }
  if (route.view === 'new') {
    // Crear viaje: con el modelo email-first (issue #506), cualquier usuario con
    // sesión OTP verificada puede crear. La RLS `groups_insert_owner` es el candado
    // real; aquí ya no hay muro de "valida tu correo". CreateGate eliminado.
    //
    // EXCEPCIÓN (issue #758): un receptor ANÓNIMO no puede crear (migración
    // 0032 lo impide en RLS). En vez de dejarlo rellenar el formulario entero
    // para chocar al final con el error crudo de RLS, se lo decimos ANTES con
    // el mismo CTA "guárdate" que ofrecemos tras jugar.
    if (isAnonymous) {
      return (
        <Suspense fallback={<UtilityRouteSkeleton />}>
          <AnonCreateGate onBack={() => goHome()} />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<UtilityRouteSkeleton />}>
        <CreateGroup onBack={() => goHome()} />
      </Suspense>
    )
  }
  if (route.view === 'profile') {
    return (
      <Suspense fallback={<UtilityRouteSkeleton />}>
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
      </Suspense>
    )
  }

  // Raíz sin hash → home/dashboard (centro de gravedad con sesión, §3). Para el
  // admin añadimos un acceso DISCRETO a `#admin` (un enlace flotante), invisible
  // para el resto. Solo en la home para no estorbar en grupo/jugar/perfil.
  // Fallback `HomeRouteSkeleton` (issue "perf(cargas): entrada sin saltos"): antes
  // este `<Suspense>` usaba el `UtilityRouteSkeleton` genérico (forma de
  // FORMULARIO) mientras llegaba el chunk, y en cuanto `HomePage` montaba pintaba
  // su PROPIO esqueleto (forma de globo+feed) mientras `useHomeData` resolvía —
  // dos esqueletos de forma distinta en la misma carga es un doble-swap visible
  // (form → globo → contenido). Con el mismo `HomeRouteSkeleton` en ambos sitios,
  // el arranque logueado pinta un único layout de espera hasta el contenido real.
  return (
    <Suspense fallback={<HomeRouteSkeleton />}>
      <HomePage />
      {isAdminEmail(user?.email) && <AdminLink />}
    </Suspense>
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

// CTA "guárdate" cuando un receptor ANÓNIMO llega a `#nuevo` (issue #758): crear
// un viaje exige cuenta permanente (RLS `groups_insert_owner`, migración 0032),
// así que en vez de dejarlo rellenar el formulario para chocar al final con un
// error crudo, se lo decimos aquí y le ofrecemos vincular su sesión (mismo uid,
// no pierde nada de lo que ya vio/jugó). Cerrar el modal sin vincular vuelve a
// la home: esta pantalla no tiene nada más que ofrecer a quien no quiere seguir.
function AnonCreateGate({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  return (
    <main className="lg-page">
      <Stack gap={4}>
        <BackHomeButton onClick={onBack} label="Volver" />
        <Card padding="md" raised>
          <Stack gap={3} align="center">
            <strong>Guarda tu cuenta para crear un viaje</strong>
            <p>
              Estás entrando como invitado. Para crear un viaje nuevo, guarda tu cuenta con tu
              correo: no pierdes nada de lo que ya has visto o jugado.
            </p>
          </Stack>
        </Card>
      </Stack>
      <AccountUpgradeModal
        open
        onClose={onBack}
        origin="anon_create_gate"
        onUpgraded={() => {
          toast.show('Cuenta guardada. Ya puedes crear tu viaje.', { tone: 'success' })
        }}
      />
    </main>
  )
}

// Redirige a la home limpiando el hash (p.ej. un no-admin en `#admin`). El
// borrado va en un efecto para no mutar location durante el render; mientras,
// pintamos la home para no dejar la pantalla en blanco.
function RedirectHome() {
  useEffect(() => {
    goHome()
  }, [])
  return (
    <Suspense fallback={<HomeRouteSkeleton />}>
      <HomePage />
    </Suspense>
  )
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
