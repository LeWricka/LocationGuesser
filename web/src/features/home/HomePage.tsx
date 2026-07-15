import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Avatar,
  Card,
  EmptyState,
  GlobeSheet,
  HomeDashboard,
  HomeEmptyState,
  HomeRouteSkeleton,
  Icon,
  LogoMomentu,
  WordmarkMomentu,
  sortTrips,
} from '../../ui'
import type { GlobePin, GlobeRoute, HomeGroup, HomePinned } from '../../ui'
import { useSession } from '../../lib/session-context'
import { supabase } from '../../lib/supabase'
import { signedImageUrl } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { useHomeData } from './useHomeData'
import { useWorldTrips } from './useWorldTrips'
import { HOME_DEMO_PINS } from './homeDemoPins'
import { gotoChallenge, gotoCreateGroup, gotoGroup, gotoProfile } from './navigation'
import { OnboardingSlideshow, getSlides, useOnboarding } from '../onboarding'
import styles from './HomePage.module.css'

// Home logueada (patrón GLOBO + HOJA, referencia Polarsteps): un globo héroe a sangre
// arriba con los pines-foto de tus viajes (tocables → abren el viaje) y una HOJA BLANCA
// debajo con el contenido legible (Banner "Te toca jugar" + feed de portadas + FAB "+").
// Lee la sesión (useSession), la membresía (useHomeData) y las coordenadas de tus viajes
// (useWorldTrips) para alimentar el globo. La navegación se hace por hash (la home no
// posee el router; ver ./navigation.ts): #g=<id>, #g=<id>&c=<cId>, #nuevo, #perfil.
export function HomePage() {
  const { user, profile, loading: sessionLoading } = useSession()
  const { loading: dataLoading, error, data, reload } = useHomeData(user?.id)

  // Tutorial ÚNICO de entrada (issue #742): un solo tutorial cuenta el bucle
  // completo. Se muestra una vez al aterrizar en la home vacía (persistido por
  // cuenta, #717) y se puede reabrir con "Ver tutorial". Sustituye a los tutoriales
  // por-pantalla que saltaban de más al crear viaje/reto (gates retirados de App).
  const entryTutorial = useOnboarding('entry', user?.id, profile?.onboarding)
  // Reapertura manual desde "Ver tutorial": fuerza el slideshow aunque ya se haya
  // visto (el flag solo gobierna el auto-show de la primera vez).
  const [tutorialForced, setTutorialForced] = useState(false)

  // Coordenadas de los viajes situados → pines-foto del globo héroe. Es presentación
  // derivada (anti-spoiler ya aplicado en useWorldTrips). La lista de grupos la trae
  // useHomeData; aquí solo le añadimos las coords para el globo.
  const tripList = useMemo(
    () => data.groups.map((g) => ({ id: g.id, name: g.name })),
    [data.groups],
  )
  const world = useWorldTrips(tripList)

  // Portada derivada por viaje (fallback #2 de la cascada): useWorldTrips YA resuelve,
  // para el pin del globo, la foto del momento situado más reciente de cada viaje
  // (resolveTrip → WorldTrip.coverUrl, misma firma que usan los pines). La reutilizamos
  // aquí para la tarjeta en vez de repetir la consulta/firma (#554): un viaje sin portada
  // propia pero con recuerdos situados ya no cae directo al placeholder.
  const worldCoverByGroup = useMemo(
    () => new Map(world.trips.map((t) => [t.groupId, t.coverUrl])),
    [world.trips],
  )

  // Portadas firmadas del feed: cada viaje trae su path de portada propia (coverPath); lo
  // firmamos a URL aquí (es presentación). Tolerante a fallo: un path que no firme cae a
  // null (la tarjeta usa el fondo de relleno) y nunca rompe la home.
  const [coverByGroup, setCoverByGroup] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    let cancelled = false
    const paths = data.groups
      .map((g) => ({ id: g.id, path: g.coverPath }))
      .filter((g): g is { id: string; path: string } => Boolean(g.path))
    if (paths.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado terminal sin portadas
      setCoverByGroup(new Map())
      return
    }
    void (async () => {
      const signed = await Promise.all(
        paths.map(async ({ id, path }) => [id, await signedImageUrl(path)] as const),
      )
      if (cancelled) return
      setCoverByGroup(new Map(signed.filter((e): e is [string, string] => Boolean(e[1]))))
    })()
    return () => {
      cancelled = true
    }
  }, [data.groups])

  // Analítica: una vista de home por montaje (cuenta la llegada, no la carga).
  useEffect(() => {
    track('home_viewed')
  }, [])

  // Realtime "ligero": cualquier voto o reto nuevo en los grupos del usuario puede cambiar
  // sus estados ("te toca", "en vivo"), sus números o el reto fijado, así que recargamos
  // la home. Sin filtro por grupo: un canal global de bajo volumen para un piloto de
  // amigos. No bloquea: si el realtime falla, queda la carga al montar.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        void reload()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => {
        void reload()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, reload])

  // CTAs con analítica: el evento se emite junto a la navegación (un único punto).
  function onCreateGroup() {
    track('create_group_cta')
    gotoCreateGroup()
  }

  // "Ver tutorial" → reabre el tutorial único. Al cerrarlo (completar o saltar) lo
  // marcamos visto (idempotente si ya lo estaba) y bajamos la reapertura forzada.
  function openTutorial() {
    setTutorialForced(true)
  }
  function closeTutorial() {
    setTutorialForced(false)
    entryTutorial.markSeen()
  }

  // Mientras resolvemos la sesión persistida o cargamos la membresía → skeletons.
  // SIEMPRE damos feedback de carga (no pantalla en blanco).
  if (sessionLoading || dataLoading) {
    return <HomeRouteSkeleton />
  }

  if (error) {
    return (
      <main className="lg-page">
        <Card>
          {/* Estado de error con UNA salida clara: reintentar la carga (no deja al
              usuario en un callejón sin acción). */}
          <EmptyState
            icon={<Icon icon={AlertTriangle} size={32} />}
            tone="danger"
            title="No hemos podido cargar tu inicio"
            description="Puede ser un fallo de conexión. Inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => void reload()}
          />
        </Card>
      </main>
    )
  }

  // El nombre puede no estar listo si el perfil aún carga; caemos a un saludo genérico
  // para no mostrar "undefined". El paso de perfil garantiza el display_name al entrar.
  const displayName = profile?.display_name?.trim() || 'jugador'
  // Id estable para el avatar (animal + fondo). En esta pantalla la sesión ya está
  // iniciada; el fallback evita un id vacío en el render transitorio.
  const userId = user?.id ?? ''
  const hasGroups = data.groups.length > 0

  // Tutorial ÚNICO de entrada (issue #742): auto-show una sola vez para el recién
  // llegado (home vacía, aún sin viajes); para quien ya tiene viajes NO se
  // interpone (solo lo reabre a mano). `tutorialForced` cubre la reapertura desde
  // "Ver tutorial", ignore el flag de "ya visto".
  const showEntryTutorial = (!hasGroups && entryTutorial.shouldShow) || tutorialForced

  // Cascada de portada por viaje: (1) portada propia firmada; (2) foto del recuerdo más
  // reciente (ya resuelta por useWorldTrips para el pin del globo, ver arriba); (3) null →
  // la tarjeta cae al fondo de relleno (placeholder de mapa nocturno).
  const groups: HomeGroup[] = data.groups.map((g) => ({
    ...g,
    coverUrl: coverByGroup.get(g.id) ?? worldCoverByGroup.get(g.id) ?? null,
  }))

  // Reto fijado "Te toca jugar": traducimos el reto pendiente más urgente (ya firmado en
  // useHomeData) a la forma que consume el layout. Sin pendiente → null.
  const pinned: HomePinned | null = data.pinned
    ? {
        groupId: data.pinned.groupId,
        challengeId: data.pinned.challengeId,
        title: data.pinned.title,
        groupName: data.pinned.groupName,
        deadlineAt: data.pinned.deadlineAt,
        coverUrl: data.pinned.coverUrl,
      }
    : null

  // Pin "pendiente" del globo (issue #776, anillos de sónar): el reto "Te toca jugar"
  // NO tiene coordenada propia (sería spoiler, ver la regla anti-spoiler de
  // useWorldTrips) — señalamos en su lugar el punto MÁS RECIENTE del viaje al que
  // pertenece (mismo criterio que el "lead" de abajo). Sin reto pendiente, o sin
  // puntos situados de ese viaje (aún no hay recuerdos/retos cerrados) → ningún pin
  // se marca; el globo queda igual que hoy.
  const pendingTrip = pinned ? world.trips.find((t) => t.groupId === pinned.groupId) : undefined
  const pendingPointId = pendingTrip?.points.length
    ? pendingTrip.points[pendingTrip.points.length - 1].id
    : null

  // Pines-foto del globo: un pin por punto situado de cada viaje — el "mapamundi
  // poblado" (#700). El anillo cálido ("lead") lo lleva SOLO el momento más reciente
  // del viaje PROTAGONISTA (el primero del carrusel, mismo orden `sortTrips` que usa
  // HomeDashboard): con un lead por viaje, un globo con varios viajes pulsaría por
  // todas partes. Al enfocar otra tarjeta, HomeGlobe reasigna el lead en exclusiva
  // (contrato de `activeTargetId`). Tocar cualquier pin abre su viaje.
  const protagonistId = sortTrips(groups)[0]?.id ?? null
  const pins: GlobePin[] = world.trips.flatMap((trip) => {
    const leadId =
      trip.groupId === protagonistId && trip.points.length > 0
        ? trip.points[trip.points.length - 1].id
        : null
    return trip.points.map((p) => ({
      id: `${trip.groupId}:${p.id}`,
      lat: p.lat,
      lng: p.lng,
      title: `${trip.name} · ${p.title}`,
      imageUrl: p.imageUrl,
      targetId: trip.groupId,
      lead: p.id === leadId,
      pending: trip.groupId === pinned?.groupId && p.id === pendingPointId,
    }))
  })

  // Rutas doradas del globo (issue #702): una polyline por viaje, en el mismo orden
  // cronológico ASC que ya trae `trip.points` (ver `useWorldTrips.resolveTrip`). Sin
  // reordenar aquí: HomeGlobe respeta el orden que le llega.
  const routes: GlobeRoute[] = world.trips.map((trip) => ({
    targetId: trip.groupId,
    points: trip.points.map((p) => [p.lng, p.lat]),
  }))

  return (
    // lg-content-in (issue #623): crossfade corto al relevar a HomeRouteSkeleton,
    // en vez de un swap seco.
    <main className="lg-page lg-content-in">
      {hasGroups ? (
        <HomeDashboard
          userId={userId}
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          groups={groups}
          pins={pins}
          routes={routes}
          pinned={pinned}
          onOpenProfile={gotoProfile}
          onCreateGroup={onCreateGroup}
          onOpenGroup={gotoGroup}
          onPlayPinned={
            pinned ? () => gotoChallenge(pinned.groupId, pinned.challengeId) : undefined
          }
          // Recuperación de portadas caducadas (issue #638): si una tarjeta falla al
          // pintar su foto (URL firmada caducada, PWA viva horas), recargamos la home
          // por delante en vez de dejarla en blanco.
          onCoverError={() => void reload()}
        />
      ) : (
        // Recién llegado: mismo patrón globo + hoja. El globo arranca con pines DEMO
        // curados (aún no hay viajes) y la hoja lleva la bienvenida + el CTA "Crear
        // viaje" (issue #742: fuera el bloque de pasos, que empujaba el CTA fuera de
        // la vista). SIN FAB "+": aquí el CTA primario ya es "Crear viaje" dentro de
        // la hoja, así que el FAB sería redundante. El FAB vuelve en el dashboard.
        //
        // `framing="world"` (#516, no el 'pins' por defecto): los pines DEMO están
        // REPARTIDOS por todo el planeta a propósito (ver homeDemoPins.ts), así que un
        // `fitBounds` a sus coordenadas encajaría una vista casi antípoda —zoom mínimo,
        // cámara ESTÁTICA (sin deriva; ver HomeGlobe)— donde media constelación queda
        // para siempre en la cara oculta del globo. Ahí sí importaba el culling, pero un
        // pin oculto de forma PERMANENTE es peor experiencia que uno que, con la deriva
        // de 'world', entra y sale del hemisferio visible con el giro. 'world' es además
        // el mismo framing que ya usa la landing deslogueada (Landing.tsx) para estos
        // mismos pines: aquí faltaba pasarlo explícitamente y por eso cayó al 'pins' por
        // defecto (la causa real de los pines en sitios imposibles del reporte).
        <GlobeSheet
          pins={HOME_DEMO_PINS}
          onOpenPin={onCreateGroup}
          framing="world"
          sheetLabel="Bienvenida"
          overlay={
            <>
              <span className={styles.brand}>
                <LogoMomentu variant="oscuro" size={22} />
                <WordmarkMomentu size={18} />
              </span>
              {/* Un solo acceso al perfil (issue #616): antes el engranaje duplicaba el
                  mismo destino que el avatar — patrón universal, el avatar basta. */}
              <button
                type="button"
                className={styles.avatarButton}
                onClick={gotoProfile}
                aria-label="Abrir tu perfil"
              >
                <Avatar
                  userId={userId}
                  name={displayName}
                  avatarUrl={profile?.avatar_url}
                  size="sm"
                />
              </button>
            </>
          }
        >
          <div className={styles.welcome}>
            <HomeEmptyState
              name={displayName}
              onCreateGroup={onCreateGroup}
              onOpenTutorial={openTutorial}
            />
          </div>
        </GlobeSheet>
      )}

      {/* Tutorial ÚNICO de entrada (issue #742): overlay modal sobre la home. Se
          auto-muestra una vez en la home vacía y se reabre con "Ver tutorial".
          Completar y saltar cierran igual (lo marcan visto). */}
      {showEntryTutorial && (
        <OnboardingSlideshow
          slides={getSlides('entry')}
          onComplete={closeTutorial}
          onSkip={closeTutorial}
        />
      )}
    </main>
  )
}

// El esqueleto de la home (globo + banner del reto + feed) vive ahora en
// `ui/RouteSkeletons.tsx` como `HomeRouteSkeleton`: lo reusa TAMBIÉN el
// `<Suspense>` de App.tsx como fallback mientras llega el chunk de esta
// pantalla, así el arranque logueado pinta UN SOLO layout de espera (nunca el
// esqueleto genérico de formulario seguido de este) — ver el comentario junto
// a `HomeRouteSkeleton` para el porqué completo.
