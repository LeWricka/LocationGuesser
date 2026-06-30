import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Avatar,
  Card,
  EmptyState,
  HomeDashboard,
  HomeEmptyState,
  Icon,
  Skeleton,
  Stack,
  Row,
} from '../../ui'
import type { HomeGroup, HomePinned } from '../../ui'
import { useSession } from '../../lib/session-context'
import { supabase } from '../../lib/supabase'
import { signedImageUrl } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { useHomeData } from './useHomeData'
import { JoinGroupModal } from './JoinGroupModal'
import { gotoChallenge, gotoCreateGroup, gotoGroup, gotoProfile } from './navigation'
import styles from './HomePage.module.css'

// Home logueada (maqueta B "diario visual"): un FEED vertical de tarjetas-portada (la
// foto del viaje ES la tarjeta) con el reto abierto FIJADO arriba ("Te toca jugar"). Lee
// la sesión (useSession) y la membresía (useHomeData) y alimenta el layout presentacional
// HomeDashboard. La navegación se hace por hash (la home no posee el router; ver
// ./navigation.ts): #g=<id>, #g=<id>&c=<cId>, #nuevo, #perfil.
//
// SIN mapamundi a sangre de héroe: la home ya NO monta MapLibre/HomeWorldMap. El mapa, si
// acaso, es una mini-cinta CSS (pin) dentro de cada tarjeta. Para el recién llegado (sin
// viajes) la home es el hero de bienvenida (crear/unirse).
export function HomePage() {
  const { user, profile, loading: sessionLoading } = useSession()
  const { loading: dataLoading, error, data, reload } = useHomeData(user?.id)
  const [joinOpen, setJoinOpen] = useState(false)

  // Portadas firmadas del feed: cada viaje trae su path de portada propia (coverPath);
  // lo firmamos a URL aquí (es presentación). Tolerante a fallo: un path que no firme cae
  // a null (la tarjeta usa el fondo de relleno) y nunca rompe la home.
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

  // Realtime "ligero": cualquier voto o reto nuevo en los grupos del usuario puede
  // cambiar sus estados ("te toca", "en vivo"), sus números o el reto fijado, así que
  // recargamos la home. Sin filtro por grupo (no conocemos la lista antes de cargar): un
  // canal global de bajo volumen para un piloto de amigos. No bloquea: si el realtime
  // falla, queda la carga al montar.
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
          {/* Estado de error con UNA salida clara: reintentar la carga (no deja
              al usuario en un callejón sin acción). */}
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

  // El nombre puede no estar listo si el perfil aún carga; caemos a un saludo
  // genérico para no mostrar "undefined". El paso de perfil (#4) garantiza el
  // display_name en el primer login.
  const displayName = profile?.display_name?.trim() || 'jugador'
  // Id estable para el avatar (animal + fondo). En esta pantalla la sesión ya
  // está iniciada; el fallback evita un id vacío en el render transitorio.
  const userId = user?.id ?? ''
  const hasGroups = data.groups.length > 0

  // Portada por viaje: usamos la portada propia ya firmada (null → la tarjeta cae al
  // fondo de relleno). No deriva del mapamundi (no montamos su infra).
  const groups: HomeGroup[] = data.groups.map((g) => ({
    ...g,
    coverUrl: coverByGroup.get(g.id) ?? null,
  }))

  // Reto fijado "Te toca jugar": traducimos el reto pendiente más urgente (ya firmado en
  // useHomeData) a la forma que consume el layout. Sin pendiente → null (no se fija nada).
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
    // Con viajes, el feed B scrollea de forma natural: el propio HomeDashboard rompe el
    // padding de página y se gestiona la cabecera sticky + el alto. Sin viajes, el hero
    // de bienvenida vive dentro del padding normal de .lg-page.
    <main className="lg-page">
      {hasGroups ? (
        <HomeDashboard
          userId={userId}
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          groups={groups}
          pinned={pinned}
          onOpenProfile={gotoProfile}
          onCreateGroup={onCreateGroup}
          onJoinGroup={onJoinGroup}
          onOpenGroup={gotoGroup}
          onPlayPinned={
            pinned ? () => gotoChallenge(pinned.groupId, pinned.challengeId) : undefined
          }
        />
      ) : (
        // Recién llegado: el hero explicativo es protagonista. Mantenemos la
        // cabecera (saludo + acceso al perfil) para no perder utilidad.
        <div className={styles.welcome}>
          <header className={styles.header}>
            <div className={styles.greeting}>
              <p className={styles.hello}>Hola,</p>
              <h2 className={styles.name}>{displayName}</h2>
            </div>
            <button
              type="button"
              className={styles.profileButton}
              onClick={gotoProfile}
              aria-label="Abrir tu perfil"
            >
              <Avatar
                userId={userId}
                name={displayName}
                avatarUrl={profile?.avatar_url}
                size="md"
              />
            </button>
          </header>
          <HomeEmptyState
            name={displayName}
            onCreateGroup={onCreateGroup}
            onJoinGroup={onJoinGroup}
          />
        </div>
      )}

      <JoinGroupModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </main>
  )
}

// Esqueleto que reproduce el layout de la home (cabecera + reto fijado + feed) con
// shimmer: el ojo "lee" la estructura antes de que lleguen los datos, así la espera
// se percibe más corta. role=status anuncia la carga; los bloques van aria-hidden.
function HomeSkeleton() {
  return (
    <main className="lg-page" role="status" aria-label="Cargando tu inicio">
      <Stack gap={6}>
        <Row justify="between" align="center" gap={3}>
          <Skeleton width={120} height={28} radius="md" />
          <Skeleton width={44} height={44} radius="full" />
        </Row>

        {/* Reto fijado: una portada alta con CTA fantasma. */}
        <Stack gap={3}>
          <Skeleton width={120} height={16} />
          <Skeleton width="100%" height={300} radius="lg" />
        </Stack>

        {/* Feed de portadas: tarjetas-foto altas. */}
        <Stack gap={3}>
          <Skeleton width={110} height={16} />
          {[0, 1].map((i) => (
            <Skeleton key={i} width="100%" height={260} radius="lg" />
          ))}
        </Stack>
      </Stack>
    </main>
  )
}
