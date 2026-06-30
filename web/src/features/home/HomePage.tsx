import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import {
  Card,
  EmptyState,
  GlobeSheet,
  HomeDashboard,
  HomeEmptyState,
  Icon,
  Logo,
  Skeleton,
  Stack,
  Row,
} from '../../ui'
import type { GlobePin, HomeGroup, HomePinned } from '../../ui'
import { useSession } from '../../lib/session-context'
import { supabase } from '../../lib/supabase'
import { signedImageUrl } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { useHomeData } from './useHomeData'
import { useWorldTrips } from './useWorldTrips'
import { HOME_DEMO_PINS } from './homeDemoPins'
import { JoinGroupModal } from './JoinGroupModal'
import { gotoChallenge, gotoCreateGroup, gotoGroup, gotoProfile } from './navigation'
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
  const [joinOpen, setJoinOpen] = useState(false)

  // Coordenadas de los viajes situados → pines-foto del globo héroe. Es presentación
  // derivada (anti-spoiler ya aplicado en useWorldTrips). La lista de grupos la trae
  // useHomeData; aquí solo le añadimos las coords para el globo.
  const tripList = useMemo(
    () => data.groups.map((g) => ({ id: g.id, name: g.name })),
    [data.groups],
  )
  const world = useWorldTrips(tripList)

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
  function onJoinGroup() {
    track('join_group_cta')
    setJoinOpen(true)
  }

  // Mientras resolvemos la sesión persistida o cargamos la membresía → skeletons.
  // SIEMPRE damos feedback de carga (no pantalla en blanco).
  if (sessionLoading || dataLoading) {
    return <HomeSkeleton />
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

  // Portada por viaje: usamos la portada propia ya firmada (null → la tarjeta cae al fondo
  // de relleno).
  const groups: HomeGroup[] = data.groups.map((g) => ({
    ...g,
    coverUrl: coverByGroup.get(g.id) ?? null,
  }))

  // Pines-foto del globo: un pin por punto situado de cada viaje; el más reciente del
  // viaje más reciente lleva el anillo cálido ("lead"). Tocar un pin abre su viaje.
  const pins: GlobePin[] = world.trips.flatMap((trip) => {
    const leadId = trip.points.length > 0 ? trip.points[trip.points.length - 1].id : null
    return trip.points.map((p) => ({
      id: `${trip.groupId}:${p.id}`,
      lat: p.lat,
      lng: p.lng,
      title: `${trip.name} · ${p.title}`,
      imageUrl: p.imageUrl,
      targetId: trip.groupId,
      lead: p.id === leadId,
    }))
  })

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

  return (
    <main className="lg-page">
      {hasGroups ? (
        <HomeDashboard
          userId={userId}
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          groups={groups}
          pins={pins}
          pinned={pinned}
          onOpenProfile={gotoProfile}
          onCreateGroup={onCreateGroup}
          onOpenGroup={gotoGroup}
          onPlayPinned={
            pinned ? () => gotoChallenge(pinned.groupId, pinned.challengeId) : undefined
          }
        />
      ) : (
        // Recién llegado: mismo patrón globo + hoja. El globo arranca con pines DEMO
        // curados (aún no hay viajes) y la hoja lleva el hero de bienvenida (qué es +
        // cómo funciona + crear/unirse). El FAB "+" ya está disponible desde el inicio.
        <GlobeSheet
          pins={HOME_DEMO_PINS}
          onOpenPin={onCreateGroup}
          sheetLabel="Bienvenida"
          fab={
            <button
              type="button"
              className={styles.fab}
              onClick={onCreateGroup}
              aria-label="Empezar un viaje nuevo"
            >
              <Icon icon={Plus} size={26} />
            </button>
          }
          overlay={
            <span className={styles.brand}>
              <Logo variant="wordmark" size={20} monochrome />
            </span>
          }
        >
          <div className={styles.welcome}>
            <HomeEmptyState
              name={displayName}
              onCreateGroup={onCreateGroup}
              onJoinGroup={onJoinGroup}
            />
          </div>
        </GlobeSheet>
      )}

      <JoinGroupModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </main>
  )
}

// Esqueleto que reproduce el layout de la home (globo + hoja con reto + feed) con shimmer:
// el ojo "lee" la estructura antes de que lleguen los datos, así la espera se percibe más
// corta. role=status anuncia la carga; los bloques van aria-hidden.
function HomeSkeleton() {
  return (
    <main className="lg-page" role="status" aria-label="Cargando tu inicio">
      <Stack gap={6}>
        {/* Globo héroe (placeholder alto). */}
        <Skeleton width="100%" height={260} radius="lg" />

        {/* Banner del reto + feed de portadas. */}
        <Row justify="between" align="center" gap={3}>
          <Skeleton width={120} height={28} radius="md" />
          <Skeleton width={64} height={16} />
        </Row>
        <Skeleton width="100%" height={88} radius="lg" />
        <Stack gap={3}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width="100%" height={240} radius="lg" />
          ))}
        </Stack>
      </Stack>
    </main>
  )
}
