import { useEffect, useState } from 'react'
import {
  Avatar,
  Card,
  HomeDashboard,
  HomeEmptyState,
  HowItWorks,
  Skeleton,
  Stack,
  Row,
} from '../../ui'
import { useSession } from '../../lib/session-context'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useHomeData } from './useHomeData'
import { JoinGroupModal } from './JoinGroupModal'
import { gotoChallenge, gotoCreateGroup, gotoGroup, gotoProfile } from './navigation'
import styles from './HomePage.module.css'

// Home / dashboard cableada (cuentas-y-home.md §3): centro de gravedad de la app
// para sesión iniciada. Lee la sesión (useSession) y la membresía (useHomeData)
// y alimenta el layout presentacional HomeDashboard. La navegación se hace por
// hash (la home no posee el router; ver ./navigation.ts) para que la pieza #4 la
// enrute: #g=<id>, #g=<id>&c=<challenge>, #nuevo, #perfil.
//
// Para el recién llegado (sin grupos) la home es un HERO que explica el producto
// (issue #131): qué es + cómo funciona en 3 pasos + crear/unirse. Cuando ya hay
// grupos, manda el dashboard y el "cómo funciona" pasa a un recordatorio compacto
// al final, para no estorbar al usuario recurrente.
export function HomePage() {
  const { user, profile, loading: sessionLoading } = useSession()
  const { loading: dataLoading, error, data, reload } = useHomeData(user?.id)
  const [joinOpen, setJoinOpen] = useState(false)

  // Analítica: una vista de home por montaje. No depende de los datos (cuenta la
  // llegada, no la carga), así que va una sola vez al montar.
  useEffect(() => {
    track('home_viewed')
  }, [])

  // Realtime "ligero": cualquier voto o reto nuevo en los grupos del usuario
  // puede cambiar sus estados ("te toca", "en vivo") o sus números, así que
  // recargamos la home. Sin filtro por grupo (no conocemos la lista antes de
  // cargar) — es un canal global de bajo volumen para un piloto de amigos; si
  // crece, se acota por grupo. No bloquea: si el realtime falla, queda la carga
  // al montar.
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
          <p className={styles.error}>No hemos podido cargar tu inicio. Reintenta en un momento.</p>
        </Card>
      </main>
    )
  }

  // El nombre puede no estar listo si el perfil aún carga; caemos a un saludo
  // genérico para no mostrar "undefined". El paso de perfil (#4) garantiza el
  // display_name en el primer login.
  const displayName = profile?.display_name?.trim() || 'jugador'
  const hasGroups = data.groups.length > 0

  return (
    <main className="lg-page">
      {hasGroups ? (
        <>
          <HomeDashboard
            displayName={displayName}
            avatarUrl={profile?.avatar_url}
            turns={data.turns}
            groups={data.groups}
            stats={data.stats}
            onOpenProfile={gotoProfile}
            onCreateGroup={onCreateGroup}
            onOpenGroup={gotoGroup}
            onPlayTurn={(challengeId) => {
              // El reto necesita su grupo para el deep link #g=<grupo>&c=<reto>.
              const groupId = data.groupIdByTurn.get(challengeId)
              if (groupId) gotoChallenge(groupId, challengeId)
            }}
          />
          {/* Recordatorio compacto del bucle para el usuario recurrente: sin
              robar protagonismo al dashboard, queda al final. */}
          <div className={styles.recap}>
            <HowItWorks compact />
          </div>
        </>
      ) : (
        // Recién llegado: el hero explicativo es protagonista. Mantenemos la
        // cabecera (saludo + acceso al perfil) y el FAB para no perder utilidad.
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
              <Avatar name={displayName} src={profile?.avatar_url} size="md" />
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

// Esqueleto que reproduce el layout de la home (cabecera + secciones) con
// shimmer: el ojo "lee" la estructura antes de que lleguen los datos, así la
// espera se percibe más corta. role=status anuncia la carga; los bloques van
// aria-hidden (los pone <Skeleton/>).
function HomeSkeleton() {
  return (
    <main className="lg-page" role="status" aria-label="Cargando tu inicio">
      <Stack gap={6}>
        <Row justify="between" align="center" gap={3}>
          <Stack gap={2}>
            <Skeleton width={70} height={16} />
            <Skeleton width={160} height={30} radius="md" />
          </Stack>
          <Skeleton width={44} height={44} radius="full" />
        </Row>

        <Stack gap={3}>
          <Skeleton width={160} height={22} radius="md" />
          {[0, 1].map((i) => (
            <Card key={i} padding="md">
              <Row justify="between" align="center" gap={3}>
                <Stack gap={2}>
                  <Skeleton width={140} height={16} />
                  <Skeleton width={100} height={13} />
                </Stack>
                <Skeleton width={72} height={32} radius="sm" />
              </Row>
            </Card>
          ))}
        </Stack>

        <Stack gap={3}>
          <Skeleton width={130} height={22} radius="md" />
          {[0, 1, 2].map((i) => (
            <Card key={i} padding="md">
              <Row justify="between" align="center" gap={3}>
                <Skeleton width="45%" height={18} />
                <Skeleton width={80} height={20} radius="full" />
              </Row>
            </Card>
          ))}
        </Stack>
      </Stack>
    </main>
  )
}
