import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle,
  Flag,
  Gift,
  Images,
  Plus,
  RotateCcw,
  Settings,
  Share2,
  Trophy,
} from 'lucide-react'
import {
  Badge,
  BackHomeButton,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Lightbox,
  Modal,
  PhotoStrip,
  type PhotoStripItem,
  Row,
  Skeleton,
  Stack,
  useToast,
} from '../../ui'
import { aggregateLeaderboard, getGroupVotes, type VoteWithName } from '../../lib/leaderboard'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import { fmtDist } from '../../lib/geo'
import { formatDeadline } from '../../lib/time'
import { useSession } from '../../lib/session-context'
import {
  deleteChallenge,
  getAnswers,
  isPracticeChallenge,
  type ChallengeForPlay,
} from '../../lib/challenges'
import { deleteMyVote } from '../../lib/votes'
import { describeError } from '../../lib/errors'
import { reportError } from '../../lib/observability'
import { track } from '../../lib/analytics'
import { isMember, myGroups } from '../../lib/membership'
import type { GroupPrizes } from '../../lib/database.types'
import type { LatLng } from '../../lib/geo'
import { supabase } from '../../lib/supabase'
import type { GroupInfo } from '../../lib/groupData'
import { getGroup, getGroupChallenges, splitByStatus, updateGroupPrizes } from '../../lib/groupData'
import { tripShareUrl } from '../../lib/shareLinks'
import { PRIZE_SLOTS, prizeForRow } from './prizes'
import { ShareLeaderboardModal } from './ShareLeaderboardModal'
import { InviteModal } from './InviteModal'
import { signedImageUrl } from '../../lib/storage'
import { addChallengeHash } from '../../lib/route'
import { useSignedImage } from '../../lib/useSignedImage'
import { EditChallenge } from './EditChallenge'
import { GroupMembersSection } from './GroupMembersSection'
import { GroupSettingsModal } from './GroupSettingsModal'
import { AllGuessesMap } from './AllGuessesMap'
import { Podium, type PodiumClasses } from './Podium'
import { parseAvatar } from '../../lib/avatar'
import { Medal } from '../../ui/Medal'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Vuelve a la home (§3.4). Lo cablea #4; por defecto limpia el hash. */
  onBack?: () => void
  /**
   * Modo incrustado: la página vive como pestaña "Marcador" DENTRO del viaje, no
   * como pantalla suelta. Suprime el chrome propio (volver, contenedor de página
   * `lg-page`, acciones de cabecera, FAB de compartir y los modales de
   * Invitar/Ajustes), que ahora los gobierna el viaje (cabecera con ⋯ + FAB). Deja
   * el contenido: marcador completo, fotos, retos en vivo/anteriores y miembros.
   */
  embedded?: boolean
}

/**
 * Enlace LIMPIO del viaje para compartir (`…/v/<code>`). Genera previsualización
 * OG (la sirve `web/api/share`) y es más fiable de pegar que el hash crudo. Los
 * enlaces viejos `#g=` siguen funcionando (compatibilidad en lib/cleanRoute).
 */
function groupLink(groupId: string): string {
  return tripShareUrl(location.origin, groupId)
}

// Fecha legible en español para la cabecera de un reto cerrado (p.ej. "12 jun
// 2026"). Devuelve null si la fecha no es válida (no rompe la cabecera).
const challengeDateFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
function formatChallengeDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // Intl añade un punto al mes abreviado ("12 jun. 2026"); lo quitamos para el
  // formato compacto pedido ("12 jun 2026").
  return challengeDateFmt.format(date).replace('.', '')
}

// Página del grupo: clasificación general, retos en vivo y anteriores, histórico
// de fotos. Distingue dueño (gestiona retos) de miembro (solo juega) y se
// refresca en tiempo real al entrar cualquier voto del grupo.
export function GroupPage({ groupId, onBack, embedded = false }: Props) {
  const { user } = useSession()
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [challenges, setChallenges] = useState<ChallengeForPlay[] | null>(null)
  const [votes, setVotes] = useState<VoteWithName[] | null>(null)
  // Soy dueño del grupo (veo gestión de retos) vs miembro (solo juego).
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Crear reto ya NO es un estado interno: el botón navega al flujo INMERSIVO
  // (`#g=…&add=reto`), que al lanzar vuelve al reto recién creado (deep link). El
  // panel "compartir tras crear" vive ahora en ese flujo, no aquí.
  // Reto en edición (estado interno como `adding`): muestra la pantalla de
  // edición y al terminar refresca la lista.
  const [editing, setEditing] = useState<ChallengeForPlay | null>(null)
  // Modal de "Compartir clasificación como imagen" (genera y previsualiza el PNG).
  const [sharingLeaderboard, setSharingLeaderboard] = useState(false)
  // Modal de "Invitar al grupo" (preview del grupo + Web Share / copiar enlace).
  const [inviting, setInviting] = useState(false)
  // Modal de ajustes del grupo (renombrar / borrar), solo dueño.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const toast = useToast()
  // Evita re-avisar de un mismo voto si Realtime reenvía el evento (un toast por id).
  const announcedVotes = useRef<Set<string>>(new Set())

  // Carga conjunta de retos + votos del grupo. Se reutiliza en el primer
  // montaje y en cada cambio de Realtime para mantener la vista consistente.
  const refresh = useCallback(async () => {
    try {
      const [g, c, v] = await Promise.all([
        getGroup(groupId),
        getGroupChallenges(groupId),
        getGroupVotes(groupId),
      ])
      setGroup(g)
      setChallenges(c)
      setVotes(v)
    } catch {
      setError('Reintenta en un momento.')
    }
  }, [groupId])

  // Resolución de permisos: ¿soy dueño de este grupo? myGroups deriva isOwner
  // (created_by === user.id o role 'owner'). Si no soy miembro aún, el auto-join
  // lo gestiona el onboarding (#4); aquí solo leemos el rol.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        const member = await isMember(groupId, user.id)
        if (cancelled || !member) return
        const mine = await myGroups(user.id)
        if (cancelled) return
        setIsOwner(mine.find((g) => g.id === groupId)?.isOwner ?? false)
      } catch {
        // Permisos no resueltos: tratamos como miembro (sin gestión). No bloquea jugar.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, user])

  // Carga inicial + Realtime en un solo efecto: el setState siempre ocurre tras
  // un await/callback (nunca síncrono en el cuerpo del efecto), así que las
  // cargas en cascada que advierte la regla no aplican aquí.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh es async: setState corre tras el fetch, no síncrono
    void refresh()
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${groupId}` },
        (payload) => {
          // Solo los INSERT en vivo disparan aviso; la carga inicial no pasa por
          // aquí, así que no hay riesgo de avisar de votos antiguos. El votante
          // es un user_id ahora; el nombre llega en el refresh (join a profiles).
          if (payload.eventType === 'INSERT') {
            const id = (payload.new as { id?: string }).id
            if (id && !announcedVotes.current.has(id)) {
              announcedVotes.current.add(id)
              toast.show('Alguien acaba de votar', { tone: 'success' })
            }
          }
          void refresh()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [groupId, refresh, toast])

  const leaderboard = useMemo(() => (votes ? aggregateLeaderboard(votes) : []), [votes])

  // Fin de temporada: con closed_at el grupo está archivado → solo-lectura. Se
  // ocultan/inhabilitan las acciones de escritura (añadir reto, jugar, votar,
  // gestionar) y se muestra el podio final con el ganador destacado.
  const isClosed = group?.closed_at != null
  // Gestión de retos/premios (editar, borrar, añadir): solo el dueño Y con la
  // temporada abierta. El acceso a Ajustes sigue siendo del dueño aunque esté
  // cerrado (es donde se REABRE la temporada).
  const canManage = isOwner && !isClosed

  // Crear un reto: navega al flujo INMERSIVO (`#g=…&add=reto`). Mantenemos el
  // gating (solo dueño con temporada abierta) en la UI; el RLS lo respalda.
  function goCreateChallenge() {
    location.hash = addChallengeHash(groupId)
  }

  // Votos agrupados por reto, para alimentar marcadores en vivo y revelados sin
  // más fetches (ya traen el display_name del join a profiles).
  const votesByChallenge = useMemo(() => {
    const map = new Map<string, VoteWithName[]>()
    for (const v of votes ?? []) {
      const list = map.get(v.challenge_id)
      if (list) list.push(v)
      else map.set(v.challenge_id, [v])
    }
    return map
  }, [votes])

  const { live, past } = useMemo(() => splitByStatus(challenges ?? []), [challenges])

  // Respuestas (lat/lng) de los retos CERRADOS, para pintar el pin real en el
  // revelado de "anteriores". Ya no vienen en el reto (columna revocada en 0010):
  // se piden a `challenge_answers`, cuya RLS solo sirve las de retos cerrados o ya
  // votados. setState va dentro del .then (async), nunca síncrono en el efecto.
  const [answersById, setAnswersById] = useState<Map<string, LatLng>>(new Map())
  useEffect(() => {
    let cancelled = false
    void getAnswers(past.map((c) => c.id))
      .then((m) => {
        if (!cancelled) setAnswersById(m)
      })
      .catch(() => {
        // Sin respuestas (RLS/red): el revelado cae a "sin mapa", no rompe la página.
      })
    return () => {
      cancelled = true
    }
  }, [past])

  // Histórico de fotos del grupo. Las imágenes viven en un bucket privado y se
  // sirven con URL firmada (async), así que resolvemos las de los retos con
  // imagen en estado y construimos la tira con ellas (de la más reciente a la
  // más antigua, mismo orden que getGroupChallenges).
  const [photoSrcById, setPhotoSrcById] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const withImage = (challenges ?? []).filter((c) => c.image_path)
    void Promise.all(
      withImage.map(async (c) => [c.id, await signedImageUrl(c.image_path as string)] as const),
    ).then((pairs) => {
      if (cancelled) return
      setPhotoSrcById(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] != null)))
    })
    return () => {
      cancelled = true
    }
  }, [challenges])

  const photos = useMemo<PhotoStripItem[]>(
    () =>
      (challenges ?? [])
        .filter((c) => c.image_path && photoSrcById[c.id])
        .map((c) => ({ id: c.id, src: photoSrcById[c.id], alt: c.title, caption: c.title })),
    [challenges, photoSrcById],
  )

  const goBack =
    onBack ??
    (() => {
      location.hash = ''
    })

  // Editar un reto del grupo (solo dueño; la UI esconde el botón a los miembros).
  if (editing) {
    return (
      <EditChallenge
        challenge={editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void refresh()
        }}
      />
    )
  }

  if (error) {
    return (
      <PageRoot embedded={embedded}>
        <Card>
          <EmptyState
            tone="danger"
            icon={<Icon icon={AlertTriangle} size={32} />}
            title="No hemos podido cargar el viaje"
            description={error}
            actionLabel="Reintentar"
            onAction={() => void refresh()}
          />
        </Card>
      </PageRoot>
    )
  }

  if (!challenges || !votes) {
    return <GroupSkeleton embedded={embedded} />
  }

  const hasChallenges = challenges.length > 0

  return (
    <PageRoot embedded={embedded}>
      <Stack gap={6} className="lg-stagger">
        {!embedded && <BackHomeButton onClick={goBack} />}
        {/* Incrustado en el viaje: el nombre ya vive en la cabecera del viaje y las
            acciones (Invitar/Ajustes/Añadir) cuelgan del ⋯ y del FAB. Suprimimos la
            cabecera propia para no duplicar chrome; solo en la página suelta se pinta. */}
        {!embedded && (
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{group?.name?.trim() || groupId}</h1>
              {/* El código siempre visible (en secundario) para poder compartirlo. */}
              <p className={styles.code}>Código {groupId}</p>
            </div>
            <Row gap={2} wrap>
              <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>
                Invitar
              </Button>
              {isOwner && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Ajustes del viaje"
                >
                  <Icon icon={Settings} size={16} /> Ajustes
                </Button>
              )}
              {/* Grupo archivado (solo-lectura): no se añaden retos. */}
              {isOwner && !isClosed && (
                <Button size="sm" onClick={goCreateChallenge}>
                  <Icon icon={Plus} size={16} /> Añadir reto
                </Button>
              )}
            </Row>
          </header>
        )}

        {/* Banner de fin de temporada: el grupo está congelado y en solo-lectura.
            La fecha del cierre la da closed_at. */}
        {isClosed && (
          <div className={styles.closedBanner} role="status">
            <span className={styles.closedBannerIcon} aria-hidden="true">
              <Icon icon={Flag} size={20} />
            </span>
            <p className={styles.closedBannerText}>
              <strong>Temporada cerrada</strong>
              {(() => {
                const when = formatChallengeDate(group?.closed_at)
                return when ? <span className={styles.closedBannerDate}> · {when}</span> : null
              })()}
            </p>
          </div>
        )}

        <Leaderboard
          entries={leaderboard}
          meId={user?.id}
          prizes={group?.prizes ?? null}
          groupId={groupId}
          isOwner={canManage}
          highlightWinner={isClosed}
          onPrizesSaved={() => void refresh()}
        />

        <PhotoSection photos={photos} />

        {hasChallenges ? (
          <>
            <LiveSection
              challenges={live}
              votesByChallenge={votesByChallenge}
              groupId={groupId}
              userId={user?.id}
              isOwner={canManage}
              isClosed={isClosed}
              onDeleted={() => void refresh()}
              onReplayed={() => void refresh()}
              onEdit={setEditing}
            />
            <PastSection
              challenges={past}
              votesByChallenge={votesByChallenge}
              answersById={answersById}
              isOwner={canManage}
              onDeleted={() => void refresh()}
              onEdit={setEditing}
            />
          </>
        ) : (
          <Card>
            <EmptyState
              icon={<Icon icon={Flag} size={32} />}
              title={canManage ? 'Aún no hay retos' : 'Aún no hay retos en este viaje'}
              description={
                canManage
                  ? 'Añade el primero: una foto o un Street View y que el grupo adivine.'
                  : 'Cuando alguien comparta un reto, aparecerá aquí.'
              }
              actionLabel={canManage ? 'Añadir reto' : undefined}
              onAction={canManage ? goCreateChallenge : undefined}
            />
          </Card>
        )}

        <GroupMembersSection
          groupId={groupId}
          meId={user?.id}
          isOwner={isOwner}
          onLeft={goBack}
          onTransferred={() => {
            // Tras transferir dejo de ser dueño: refresco datos y permisos.
            setIsOwner(false)
            void refresh()
          }}
        />
      </Stack>

      {/* Modales y FAB propios SOLO en la página suelta. Incrustado en el viaje,
          Invitar/Ajustes/Cerrar/Borrar cuelgan del menú ⋯ del viaje (sus propias
          instancias), y compartir es la acción del FAB del viaje: aquí los
          suprimimos para no duplicar overlays ni FABs flotantes solapados. */}
      {!embedded && (
        <>
          {isOwner && settingsOpen && (
            <GroupSettingsModal
              groupId={groupId}
              currentName={group?.name ?? null}
              isClosed={isClosed}
              onClose={() => setSettingsOpen(false)}
              onRenamed={() => {
                setSettingsOpen(false)
                void refresh()
              }}
              onSeasonChanged={() => {
                setSettingsOpen(false)
                void refresh()
              }}
              onDeleted={goBack}
            />
          )}

          {/* FAB: abre la previa de la tarjeta de clasificación para compartirla como
              IMAGEN en el chat (motor del bucle social). Siempre accesible. */}
          <ShareLeaderboardFab onShare={() => setSharingLeaderboard(true)} />

          <ShareLeaderboardModal
            open={sharingLeaderboard}
            onClose={() => setSharingLeaderboard(false)}
            groupName={group?.name?.trim() || groupId}
            entries={leaderboard}
            prizes={group?.prizes ?? null}
            link={groupLink(groupId)}
          />

          <InviteModal
            open={inviting}
            onClose={() => setInviting(false)}
            groupId={groupId}
            groupName={group?.name?.trim() || groupId}
            link={groupLink(groupId)}
            challengeCount={challenges.length}
          />
        </>
      )}
    </PageRoot>
  )
}

// Contenedor raíz de la página del grupo. En la página suelta es el `<main>` con
// `lg-page` (ancho de lectura, min-height, safe-area). Incrustado como pestaña
// "Marcador" del viaje es un simple bloque sin ese chrome: el viaje ya aporta el
// scroll del panel, la cabecera y el safe-area inferior.
function PageRoot({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (embedded) return <div className={styles.embeddedRoot}>{children}</div>
  return <main className="lg-page">{children}</main>
}

// FAB de "Compartir clasificación": pastilla flotante abajo-izquierda (la
// derecha la usa el FAB de crear grupo en otras vistas; aquí evitamos chocar y
// respetamos el safe-area). Comparte el resumen de la tabla en un toque.
function ShareLeaderboardFab({ onShare }: { onShare: () => void }) {
  return (
    <button
      type="button"
      className={styles.shareFab}
      onClick={onShare}
      aria-label="Compartir clasificación"
    >
      <Icon icon={Share2} size={18} />
      <span className={styles.shareFabLabel}>Compartir</span>
    </button>
  )
}

// Esqueleto de carga de la página del grupo: reproduce el layout real (cabecera
// + clasificación + tarjetas) con shimmer. Reduce la espera percibida frente a
// un spinner suelto (el ojo ya "lee" la estructura). role=status anuncia la
// carga al lector de pantalla; los bloques shimmer van aria-hidden.
function GroupSkeleton({ embedded = false }: { embedded?: boolean }) {
  const className = embedded ? styles.embeddedRoot : 'lg-page'
  return (
    <div className={className} role="status" aria-label="Cargando el viaje">
      <Stack gap={6}>
        {/* La fila de cabecera (título + botón) solo en la página suelta: incrustado
            la cabecera la pone el viaje, así que el esqueleto no la reserva. */}
        {!embedded && (
          <Row justify="between" align="center" gap={3}>
            <Stack gap={2}>
              <Skeleton width={180} height={28} radius="md" />
              <Skeleton width={110} height={14} />
            </Stack>
            <Skeleton width={120} height={36} radius="sm" />
          </Row>
        )}

        <Stack gap={3}>
          <Skeleton width={200} height={22} radius="md" />
          <Card padding="none">
            <div>
              {[0, 1, 2].map((i) => (
                <Row key={i} justify="between" align="center" gap={3} className={styles.skelRow}>
                  <Skeleton width={28} height={20} radius="full" />
                  <Skeleton width="40%" height={16} />
                  <Skeleton width={48} height={16} />
                </Row>
              ))}
            </div>
          </Card>
        </Stack>

        <Stack gap={3}>
          <Skeleton width={150} height={22} radius="md" />
          {[0, 1].map((i) => (
            <Card key={i}>
              <Stack gap={3}>
                <Skeleton width="60%" height={18} />
                <Skeleton width="35%" height={14} />
                <Skeleton width="100%" height={14} />
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </div>
  )
}

// --- Histórico de fotos ----------------------------------------------------

function PhotoSection({ photos }: { photos: PhotoStripItem[] }) {
  // Slideshow: al tocar una miniatura abrimos el visor en modo galería con TODAS
  // las fotos del grupo, empezando en la tocada. Así se pasan con flechas/swipe
  // sin cerrar una y abrir otra. El Lightbox ya soporta `images` + `startIndex`.
  const [openAt, setOpenAt] = useState<number | null>(null)
  const slides = useMemo(() => photos.map((p) => ({ src: p.src ?? '', alt: p.alt })), [photos])

  if (photos.length === 0) return null
  return (
    <section>
      <h2 className={styles.sectionTitle}>
        <Icon icon={Images} size={18} /> Fotos del viaje
      </h2>
      <PhotoStrip
        photos={photos}
        onSelect={(id) => {
          const i = photos.findIndex((p) => p.id === id)
          if (i >= 0) setOpenAt(i)
        }}
      />
      <Lightbox
        open={openAt !== null}
        images={slides}
        startIndex={openAt ?? 0}
        onClose={() => setOpenAt(null)}
      />
    </section>
  )
}

// --- Clasificación general -------------------------------------------------

// Clasificación general. Los premios viven AQUÍ: se marcan inline en la fila de
// su puesto (chip ámbar) y el dueño los edita con un botón discreto junto al
// título que abre un modal. No hay sección "qué se juega" aparte (sería ruido).
function Leaderboard({
  entries,
  meId,
  prizes,
  groupId,
  isOwner,
  highlightWinner = false,
  onPrizesSaved,
}: {
  entries: LeaderboardEntry[]
  meId?: string
  prizes: GroupPrizes | null
  groupId: string
  isOwner: boolean
  /** Temporada cerrada: destaca al ganador (🏆) sobre la clasificación congelada. */
  highlightWinner?: boolean
  onPrizesSaved: () => void
}) {
  const [editingPrizes, setEditingPrizes] = useState(false)
  const hasPrizes = PRIZE_SLOTS.some(({ key }) => (prizes?.[key]?.trim() ?? '') !== '')
  // Con 3+ jugadores el top-3 va en PODIO (mismo visual que la tarjeta para
  // compartir); el 4º en adelante sigue en lista. Con menos, todos en lista.
  const hasPodium = entries.length >= 3
  const listEntries = hasPodium ? entries.slice(3) : entries
  const listStartIndex = hasPodium ? 3 : 0
  return (
    <section>
      <Row justify="between" align="center" gap={2}>
        <h2 className={styles.sectionTitle}>
          <Icon icon={Trophy} size={18} /> Clasificación general
        </h2>
        {/* Edición de premios discreta: solo el dueño, junto al título. Invita a
            añadir si aún no hay; si los hay, edita. El miembro no ve nada. */}
        {isOwner && (
          <button
            type="button"
            className={styles.editPrizesBtn}
            onClick={() => setEditingPrizes(true)}
          >
            <Icon icon={Gift} size={15} /> {hasPrizes ? 'Editar premios' : 'Añadir premios'}
          </button>
        )}
      </Row>
      {isOwner && editingPrizes && (
        <PrizesEditorModal
          groupId={groupId}
          prizes={prizes}
          onClose={() => setEditingPrizes(false)}
          onSaved={() => {
            setEditingPrizes(false)
            onPrizesSaved()
          }}
        />
      )}
      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon icon={Trophy} size={32} />}
            title="Aún no hay puntos"
            description="Jugad un reto para abrir la clasificación."
          />
        </Card>
      ) : (
        <Stack gap={4}>
          {/* Temporada cerrada: corona al ganador (1º) por encima del podio. */}
          {highlightWinner && entries[0] && (
            <p className={styles.winnerBanner}>
              <Icon icon={Trophy} size={18} /> Ganador de la temporada:{' '}
              <strong>{entries[0].name}</strong>
            </p>
          )}
          {hasPodium && (
            <Podium
              top3={entries.slice(0, 3)}
              prizes={prizes}
              totalEntries={entries.length}
              classes={groupPodiumClasses}
            />
          )}
          {listEntries.length > 0 && (
            <Card padding="none">
              <ol className={styles.ranking} start={listStartIndex + 1}>
                {listEntries.map((entry, j) => {
                  const i = listStartIndex + j
                  const isMe = meId != null && entry.userId === meId
                  const prize = prizeForRow(prizes, i, entries.length)
                  const avatar = parseAvatar(entry.avatar, entry.userId)
                  return (
                    <li
                      key={entry.userId}
                      className={`${styles.rankRow} ${isMe ? styles.rankMe : ''}`}
                      // --i alimenta el retardo de la entrada escalonada (ver CSS).
                      style={{ '--i': j } as CSSProperties}
                    >
                      <span className={`${styles.medal} ${medalClass(i)}`} aria-hidden="true">
                        {medal(i)}
                      </span>
                      <span
                        className={styles.rankAvatar}
                        style={
                          avatar.kind === 'emoji'
                            ? ({ background: avatar.bg.background } as CSSProperties)
                            : undefined
                        }
                        aria-hidden="true"
                      >
                        {avatar.kind === 'emoji' ? (
                          avatar.emoji
                        ) : (
                          <img className={styles.rankAvatarImg} src={avatar.src} alt="" />
                        )}
                      </span>
                      <div className={styles.rankMid}>
                        <span className={styles.rankName}>
                          {entry.name}
                          {isMe && <span className={styles.youTag}>Tú</span>}
                        </span>
                        {/* Premio del puesto: es un DATO descriptivo (qué se lleva),
                            no una acción. Se etiqueta como "Premio" y va bajo el
                            nombre en tinta suave, para que no se confunda con un botón
                            (hallazgo del test: la pastilla parecía pulsable). */}
                        {prize && (
                          <span className={styles.rankPrize}>
                            <Icon icon={Gift} size={13} />
                            <span className={styles.rankPrizeLabel}>Premio</span>
                            <span className={styles.rankPrizeText}>{prize}</span>
                          </span>
                        )}
                      </div>
                      <span className={styles.rankPoints}>
                        <span className={styles.rankPointsValue}>
                          {entry.points.toLocaleString('es-ES')}
                        </span>
                        <span className={styles.rankPointsUnit}>pts</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}
        </Stack>
      )}
    </section>
  )
}

// Clases del podio en la página del grupo (escala de pantalla, no la del poster
// 1080px). Se pasan al componente compartido `Podium`.
const groupPodiumClasses: PodiumClasses = {
  podium: styles.podium,
  podiumCol: styles.podiumCol,
  placeFirst: styles.placeFirst,
  placeSecond: styles.placeSecond,
  placeThird: styles.placeThird,
  crown: styles.crown,
  podiumDisc: styles.podiumDisc,
  podiumAvatar: styles.podiumAvatar,
  podiumName: styles.podiumName,
  podiumPoints: styles.podiumPoints,
  podiumPrize: styles.podiumPrize,
  pedestal: styles.pedestal,
  pedestalMedal: styles.pedestalMedal,
  gold: styles.podiumGold,
  silver: styles.podiumSilver,
  bronze: styles.podiumBronze,
}

// Clase de medalla por puesto (oro/plata/bronce/resto): da el color del disco.
function medalClass(index: number): string {
  if (index === 0) return styles.medalGold
  if (index === 1) return styles.medalSilver
  if (index === 2) return styles.medalBronze
  return styles.medalOther
}

// Número del puesto, que vive dentro del disco de medalla (su color lo distingue:
// oro / plata / bronce / neutro). Más limpio que un emoji dentro del disco.
function medal(index: number): string {
  return `${index + 1}`
}

// Editor de premios (solo dueño): modal con un campo opcional por puesto
// (1º/2º/3º/último). Ninguno es obligatorio. Los premios guardados se marcan
// luego inline en la clasificación. El RLS respalda la edición en servidor.
function PrizesEditorModal({
  groupId,
  prizes,
  onClose,
  onSaved,
}: {
  groupId: string
  prizes: GroupPrizes | null
  onClose: () => void
  onSaved: () => void
}) {
  // Arranca del valor actual para que el dueño edite sin reescribir todo.
  const [draft, setDraft] = useState<GroupPrizes>(() => ({ ...(prizes ?? {}) }))
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function save() {
    setBusy(true)
    try {
      await updateGroupPrizes(groupId, draft)
      toast.show('Premios guardados', { tone: 'success' })
      onSaved()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={
        <>
          <Icon icon={Gift} size={18} /> Premios del viaje
        </>
      }
      footer={
        <Row gap={2} justify="end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </Row>
      }
    >
      <Stack gap={3}>
        <p className={styles.empty}>Opcionales. Se marcan en la fila de cada puesto.</p>
        {PRIZE_SLOTS.map(({ key, label, rank }, i) => (
          <label key={key} className={styles.prizeField}>
            <span className={styles.prizeFieldLabel}>
              {rank ? <Medal rank={rank} size={18} /> : <Icon icon={Flag} size={16} />}
              {label}
            </span>
            <Input
              value={draft[key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              maxLength={120}
              autoFocus={i === 0}
              placeholder="Ej: elige restaurante"
            />
          </label>
        ))}
      </Stack>
    </Modal>
  )
}

// --- En vivo ---------------------------------------------------------------

function LiveSection({
  challenges,
  votesByChallenge,
  groupId,
  userId,
  isOwner,
  isClosed,
  onDeleted,
  onReplayed,
  onEdit,
}: {
  challenges: ChallengeForPlay[]
  votesByChallenge: Map<string, VoteWithName[]>
  groupId: string
  userId?: string
  isOwner: boolean
  /** Temporada cerrada: no se puede jugar/votar; el marcador queda de solo lectura. */
  isClosed: boolean
  onDeleted: () => void
  onReplayed: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  if (challenges.length === 0) return null
  return (
    <section>
      <h2 className={styles.sectionTitle}>
        <span className={styles.liveDot} aria-hidden="true" /> En vivo ahora
      </h2>
      <Stack gap={3}>
        {challenges.map((c) => (
          <LiveCard
            key={c.id}
            challenge={c}
            votes={votesByChallenge.get(c.id) ?? []}
            groupId={groupId}
            userId={userId}
            isOwner={isOwner}
            isClosed={isClosed}
            onDeleted={onDeleted}
            onReplayed={onReplayed}
            onEdit={onEdit}
          />
        ))}
      </Stack>
    </section>
  )
}

// Marcador de un reto abierto: solo nombre + puntos de quien ya jugó. Sin pines
// ni ubicación (los puntos no revelan la respuesta → seguro contra trampas).
function LiveCard({
  challenge,
  votes,
  groupId,
  userId,
  isOwner,
  isClosed,
  onDeleted,
  onReplayed,
  onEdit,
}: {
  challenge: ChallengeForPlay
  votes: VoteWithName[]
  groupId: string
  userId?: string
  isOwner: boolean
  isClosed: boolean
  onDeleted: () => void
  onReplayed: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  const ranked = [...votes].sort((a, b) => b.points - a.points)
  const playHref = `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(challenge.id)}`
  // El voto del usuario actual (por user_id): si ya jugó, no puede re-jugar
  // aunque el reto siga en vivo. La identidad es la sesión.
  const myVote = userId ? votes.find((v) => v.user_id === userId) : undefined
  // "Volver a jugar" SOLO en retos de práctica y con la temporada abierta: rejugar
  // uno real tras ver la respuesta sería trampa, y un grupo cerrado es solo-lectura.
  const canReplay = myVote != null && !isClosed && isPracticeChallenge(challenge.deadline_at)
  return (
    <Card>
      <Stack gap={3}>
        <Row justify="between" align="start" gap={2}>
          <h3 className={styles.challengeTitle}>{challenge.title}</h3>
          <Badge tone="live" dot>
            en vivo
          </Badge>
        </Row>
        <p className={styles.deadline}>{formatDeadline(challenge.deadline_at)}</p>
        {ranked.length === 0 ? (
          <p className={styles.empty}>Nadie ha jugado todavía. ¡Sé el primero!</p>
        ) : (
          <ul className={styles.scoreboard}>
            {ranked.map((v) => (
              <li key={v.id} className={styles.scoreRow}>
                <span className={styles.scoreName}>
                  {v.display_name}
                  {/* Anti-trampa (issue #200): salió de la app durante la jugada. */}
                  {v.left_app && (
                    <span
                      className={styles.leftAppFlag}
                      title="Salió de la app durante la jugada"
                      aria-label="Salió de la app durante la jugada"
                    >
                      <Icon icon={AlertTriangle} size={14} />
                    </span>
                  )}
                </span>
                <span className={styles.scorePoints}>{v.points.toLocaleString('es-ES')} pts</span>
              </li>
            ))}
          </ul>
        )}
        <Row gap={3} justify="between" align="center">
          {myVote ? (
            // Ya jugó: muestra los puntos y deja reentrar al revelado (el enlace
            // reabre el resultado, PlayChallenge detecta el voto existente). En
            // práctica, además, "volver a jugar" borra el voto y reabre el reto.
            <Row gap={2} align="center" wrap>
              <a className={styles.played} href={playHref}>
                Ya jugaste · {myVote.points.toLocaleString('es-ES')} pts
              </a>
              {canReplay && (
                <ReplayChallengeButton
                  challengeId={challenge.id}
                  groupId={groupId}
                  onReplayed={onReplayed}
                />
              )}
            </Row>
          ) : isClosed ? (
            // Temporada cerrada: no se admite jugar (el voto fallaría en submit_vote).
            <span className={styles.empty}>Temporada cerrada</span>
          ) : (
            <a className={styles.playLink} href={playHref}>
              Jugar este reto →
            </a>
          )}
          {isOwner && (
            <Row gap={2}>
              <Button variant="ghost" size="sm" onClick={() => onEdit(challenge)}>
                Editar
              </Button>
              <DeleteChallengeButton
                challengeId={challenge.id}
                groupId={groupId}
                voteCount={votes.length}
                onDeleted={onDeleted}
              />
            </Row>
          )}
        </Row>
      </Stack>
    </Card>
  )
}

// Botón de borrar reto (solo dueño; RLS lo respalda). Confirma antes de borrar y
// avisa cuántas jugadas se perderán (FK on delete cascade borra los votos).
function DeleteChallengeButton({
  challengeId,
  groupId,
  voteCount,
  onDeleted,
}: {
  challengeId: string
  groupId: string
  voteCount: number
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function remove() {
    const plays =
      voteCount === 0
        ? 'Aún no tiene jugadas.'
        : `Se borrarán ${voteCount} ${voteCount === 1 ? 'jugada' : 'jugadas'}.`
    if (!confirm(`¿Borrar este reto? ${plays} No se puede deshacer.`)) return
    setBusy(true)
    try {
      await deleteChallenge(challengeId)
      track('challenge_deleted', { group_id: groupId, challenge_id: challengeId })
      toast.show('Reto borrado', { tone: 'neutral' })
      onDeleted()
    } catch (err) {
      toast.show(`No se pudo borrar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" loading={busy} onClick={() => void remove()}>
      Borrar
    </Button>
  )
}

// "Volver a jugar" en la tarjeta del reto, SOLO en retos de práctica (el gating
// lo decide LiveCard). Borra el voto propio (RLS limita el borrado a las filas
// del usuario) y refresca el grupo: la tarjeta vuelve a "sin jugar" y se puede
// rejugar. No hay confirmación: en práctica rejugar es el flujo esperado.
function ReplayChallengeButton({
  challengeId,
  groupId,
  onReplayed,
}: {
  challengeId: string
  groupId: string
  onReplayed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function replay() {
    setBusy(true)
    try {
      await deleteMyVote(challengeId)
      track('challenge_replayed', { group_id: groupId, challenge_id: challengeId })
      toast.show('Voto borrado, puedes volver a jugar', { tone: 'success' })
      onReplayed()
    } catch (err) {
      reportError(err, { area: 'replay_challenge', challengeId })
      toast.show(describeError(err), { tone: 'danger' })
      setBusy(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={() => void replay()}>
      <Icon icon={RotateCcw} size={16} /> Volver a jugar
    </Button>
  )
}

// --- Anteriores ------------------------------------------------------------

function PastSection({
  challenges,
  votesByChallenge,
  answersById,
  isOwner,
  onDeleted,
  onEdit,
}: {
  challenges: ChallengeForPlay[]
  votesByChallenge: Map<string, VoteWithName[]>
  answersById: Map<string, LatLng>
  isOwner: boolean
  onDeleted: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  return (
    <section>
      <h2 className={styles.sectionTitle}>Anteriores</h2>
      {challenges.length === 0 ? (
        <Card>
          <p className={styles.empty}>Todavía no hay retos cerrados.</p>
        </Card>
      ) : (
        <Stack gap={3}>
          {challenges.map((c) => (
            <PastCard
              key={c.id}
              challenge={c}
              votes={votesByChallenge.get(c.id) ?? []}
              answer={answersById.get(c.id) ?? null}
              isOwner={isOwner}
              onDeleted={onDeleted}
              onEdit={onEdit}
            />
          ))}
        </Stack>
      )}
    </section>
  )
}

// Reto cerrado: al desplegar se reconstruye (foto + ubicación real + votos). Los
// votos ya vienen cargados a nivel de grupo (con display_name), sin más fetches.
function PastCard({
  challenge,
  votes,
  answer,
  isOwner,
  onDeleted,
  onEdit,
}: {
  challenge: ChallengeForPlay
  votes: VoteWithName[]
  /** Respuesta real (de challenge_answers, RLS). null si aún no llegó o no hay derecho. */
  answer: LatLng | null
  isOwner: boolean
  onDeleted: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  const [open, setOpen] = useState(false)
  const imageUrl = useSignedImage(challenge.image_path)
  const ranked = [...votes].sort((a, b) => b.points - a.points)
  // Fecha del reto: el cierre (deadline) es lo más informativo de un reto cerrado;
  // si no hubiera, caemos a la creación.
  const dateLabel = formatChallengeDate(challenge.deadline_at ?? challenge.created_at)

  return (
    <Card padding="none">
      <button
        className={[styles.disclosure, 'lg-press'].join(' ')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* Miniatura de la foto a la izquierda (si la hay); título en el centro;
            fecha a la derecha. Mantiene el desplegable. */}
        {imageUrl && (
          <img
            className={styles.pastThumb}
            src={imageUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
          />
        )}
        <span className={styles.pastTitle}>{challenge.title}</span>
        <Row gap={2} align="center">
          {dateLabel && <span className={styles.pastDate}>{dateLabel}</span>}
          <Badge tone="neutral">cerrado</Badge>
          <span className={styles.chevron} aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
        </Row>
      </button>

      {open && (
        <div className={styles.reveal}>
          <Stack gap={4}>
            {imageUrl && (
              <img className={styles.photo} src={imageUrl} alt={challenge.title} loading="lazy" />
            )}
            {answer ? (
              <AllGuessesMap
                answer={answer}
                // Los votos de timeout no tienen pin (guess null): no se plotean.
                guesses={ranked
                  .filter((v) => v.guess_lat != null && v.guess_lng != null)
                  .map((v) => ({
                    userId: v.user_id,
                    name: v.display_name,
                    avatar: v.avatar,
                    lat: v.guess_lat as number,
                    lng: v.guess_lng as number,
                  }))}
              />
            ) : null}
            {ranked.length === 0 ? (
              <p className={styles.empty}>Este reto se cerró sin votos.</p>
            ) : (
              <ul className={styles.scoreboard}>
                {ranked.map((v) => (
                  <li key={v.id} className={styles.scoreRow}>
                    <span className={styles.scoreName}>
                      {v.display_name}
                      {/* Anti-trampa (issue #200): salió de la app durante la jugada. */}
                      {v.left_app && (
                        <span
                          className={styles.leftAppFlag}
                          title="Salió de la app durante la jugada"
                          aria-label="Salió de la app durante la jugada"
                        >
                          <Icon icon={AlertTriangle} size={14} />
                        </span>
                      )}
                    </span>
                    <span className={styles.scoreDist}>
                      {v.distance_km == null ? '— sin marcar' : fmtDist(v.distance_km)}
                    </span>
                    <span className={styles.scorePoints}>
                      {v.points.toLocaleString('es-ES')} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isOwner && (
              <Row justify="end" gap={2}>
                <Button variant="ghost" size="sm" onClick={() => onEdit(challenge)}>
                  Editar
                </Button>
                <DeleteChallengeButton
                  challengeId={challenge.id}
                  groupId={challenge.group_id}
                  voteCount={votes.length}
                  onDeleted={onDeleted}
                />
              </Row>
            )}
          </Stack>
        </div>
      )}
    </Card>
  )
}
