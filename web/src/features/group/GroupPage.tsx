import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Badge,
  BackHomeButton,
  Button,
  Card,
  Input,
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
import { deleteChallenge, getAnswers, type ChallengeForPlay } from '../../lib/challenges'
import { track } from '../../lib/analytics'
import { isMember, myGroups } from '../../lib/membership'
import type { GroupPrizes } from '../../lib/database.types'
import type { LatLng } from '../../lib/geo'
import { supabase } from '../../lib/supabase'
import type { GroupInfo } from '../../lib/groupData'
import { getGroup, getGroupChallenges, splitByStatus, updateGroupPrizes } from '../../lib/groupData'
import { PRIZE_SLOTS, prizeForRow } from './prizes'
import { ShareLeaderboardModal } from './ShareLeaderboardModal'
import { signedImageUrl } from '../../lib/storage'
import { useSignedImage } from '../../lib/useSignedImage'
import { CreateChallenge } from '../create/CreateChallenge'
import { EditChallenge } from './EditChallenge'
import { GroupMembersSection } from './GroupMembersSection'
import { GroupSettingsModal } from './GroupSettingsModal'
import { RevealMap } from './RevealMap'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Vuelve a la home (§3.4). Lo cablea #4; por defecto limpia el hash. */
  onBack?: () => void
}

/** Enlace del grupo (#g=) para compartir en el chat. */
function groupLink(groupId: string): string {
  return `${location.origin}${location.pathname}#g=${encodeURIComponent(groupId)}`
}

/** Enlace de un reto concreto (#g=…&c=…) para compartir tras crearlo. */
function challengeLink(groupId: string, challengeId: string): string {
  return `${groupLink(groupId)}&c=${encodeURIComponent(challengeId)}`
}

// Página del grupo: clasificación general, retos en vivo y anteriores, histórico
// de fotos. Distingue dueño (gestiona retos) de miembro (solo juega) y se
// refresca en tiempo real al entrar cualquier voto del grupo.
export function GroupPage({ groupId, onBack }: Props) {
  const { user } = useSession()
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [challenges, setChallenges] = useState<ChallengeForPlay[] | null>(null)
  const [votes, setVotes] = useState<VoteWithName[] | null>(null)
  // Soy dueño del grupo (veo gestión de retos) vs miembro (solo juego).
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "Añadir reto" es un estado interno de la página (no una ruta nueva):
  // `adding` muestra el formulario; `created` muestra el reto recién creado con
  // su enlace para compartir, sin salir del grupo.
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)
  // Reto en edición (estado interno como `adding`): muestra la pantalla de
  // edición y al terminar refresca la lista.
  const [editing, setEditing] = useState<ChallengeForPlay | null>(null)
  // Modal de "Compartir clasificación como imagen" (genera y previsualiza el PNG).
  const [sharingLeaderboard, setSharingLeaderboard] = useState(false)
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
      setError('No hemos podido cargar el grupo. Reintenta en un momento.')
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

  // Añadir reto al grupo existente. Solo el dueño llega aquí (la UI esconde el
  // botón a los miembros; el RLS lo respalda). Al terminar, refrescamos.
  if (adding) {
    return (
      <CreateChallenge
        groupId={groupId}
        onBack={() => setAdding(false)}
        onCreated={(challenge) => {
          setAdding(false)
          setCreated(challenge)
          void refresh()
        }}
      />
    )
  }

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
      <main className="lg-page">
        <Card>
          <p className={styles.error}>{error}</p>
        </Card>
      </main>
    )
  }

  if (!challenges || !votes) {
    return <GroupSkeleton />
  }

  const hasChallenges = challenges.length > 0

  return (
    <main className="lg-page">
      <Stack gap={6} className="lg-stagger">
        <BackHomeButton onClick={goBack} />
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>{group?.name?.trim() || groupId}</h1>
            {/* El código siempre visible (en secundario) para poder compartirlo. */}
            <p className={styles.code}>Código {groupId}</p>
          </div>
          <Row gap={2} wrap>
            <Button variant="secondary" size="sm" onClick={() => void shareGroup(groupId, toast)}>
              Compartir grupo
            </Button>
            {isOwner && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                aria-label="Ajustes del grupo"
              >
                ⚙️ Ajustes
              </Button>
            )}
            {isOwner && (
              <Button size="sm" onClick={() => setAdding(true)}>
                ➕ Añadir reto
              </Button>
            )}
          </Row>
        </header>

        {created && (
          <ChallengeCreated
            groupId={groupId}
            challenge={created}
            onDismiss={() => setCreated(null)}
          />
        )}

        <Leaderboard
          entries={leaderboard}
          meId={user?.id}
          prizes={group?.prizes ?? null}
          groupId={groupId}
          isOwner={isOwner}
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
              isOwner={isOwner}
              onDeleted={() => void refresh()}
              onEdit={setEditing}
            />
            <PastSection
              challenges={past}
              votesByChallenge={votesByChallenge}
              answersById={answersById}
              isOwner={isOwner}
              onDeleted={() => void refresh()}
              onEdit={setEditing}
            />
          </>
        ) : (
          <Card>
            <Stack gap={3} align="start">
              <p className={styles.empty}>
                {isOwner
                  ? 'Aún no hay retos — añade el primero.'
                  : 'Aún no hay retos en este grupo.'}
              </p>
              {isOwner && (
                <Button size="sm" onClick={() => setAdding(true)}>
                  ➕ Añadir reto
                </Button>
              )}
            </Stack>
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

      {isOwner && settingsOpen && (
        <GroupSettingsModal
          groupId={groupId}
          currentName={group?.name ?? null}
          onClose={() => setSettingsOpen(false)}
          onRenamed={() => {
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
    </main>
  )
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
      <span aria-hidden="true">📤</span>
      <span className={styles.shareFabLabel}>Compartir</span>
    </button>
  )
}

// Esqueleto de carga de la página del grupo: reproduce el layout real (cabecera
// + clasificación + tarjetas) con shimmer. Reduce la espera percibida frente a
// un spinner suelto (el ojo ya "lee" la estructura). role=status anuncia la
// carga al lector de pantalla; los bloques shimmer van aria-hidden.
function GroupSkeleton() {
  return (
    <main className="lg-page" role="status" aria-label="Cargando el grupo">
      <Stack gap={6}>
        <Row justify="between" align="center" gap={3}>
          <Stack gap={2}>
            <Skeleton width={180} height={28} radius="md" />
            <Skeleton width={110} height={14} />
          </Stack>
          <Skeleton width={120} height={36} radius="sm" />
        </Row>

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
    </main>
  )
}

// Comparte el enlace del grupo (#g=…): Web Share en móvil, copiar como respaldo.
async function shareGroup(groupId: string, toast: ReturnType<typeof useToast>) {
  const link = groupLink(groupId)
  const text = `Únete a nuestro grupo en LocationGuesser y adivina dónde son las fotos: ${link}`
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ title: 'LocationGuesser', text })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  await navigator.clipboard.writeText(text)
  toast.show('Enlace del grupo copiado, pégalo en el chat', { tone: 'success' })
}

// Panel que aparece tras crear un reto: ofrece su enlace para compartir en el
// chat del grupo. El reto ya está en la lista "en vivo"; esto solo facilita el
// reparto del enlace concreto.
function ChallengeCreated({
  groupId,
  challenge,
  onDismiss,
}: {
  groupId: string
  challenge: ChallengeForPlay
  onDismiss: () => void
}) {
  const toast = useToast()
  const link = challengeLink(groupId, challenge.id)
  const shareText = `🌍 ${challenge.title} — adivina dónde es${
    challenge.deadline_at ? ` (${formatDeadline(challenge.deadline_at)})` : ''
  }: ${link}`

  function copy() {
    void navigator.clipboard.writeText(shareText)
    toast.show('Texto copiado, pégalo en el grupo', { tone: 'success' })
  }

  async function share() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: challenge.title, text: shareText })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    copy()
  }

  return (
    <Card padding="md" raised>
      <Stack gap={3}>
        <strong>¡Reto creado! Compártelo en el grupo:</strong>
        <Input
          className={styles.linkInput}
          readOnly
          value={shareText}
          aria-label="Mensaje para compartir el reto"
          onFocus={(e) => e.target.select()}
        />
        <Row gap={2}>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button onClick={() => void share()}>Compartir</Button>
          )}
          <Button variant="secondary" onClick={copy}>
            Copiar
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Hecho
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}

// --- Histórico de fotos ----------------------------------------------------

function PhotoSection({ photos }: { photos: PhotoStripItem[] }) {
  if (photos.length === 0) return null
  return (
    <section>
      <h2 className={styles.sectionTitle}>📸 Fotos del grupo</h2>
      <PhotoStrip photos={photos} />
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
  onPrizesSaved,
}: {
  entries: LeaderboardEntry[]
  meId?: string
  prizes: GroupPrizes | null
  groupId: string
  isOwner: boolean
  onPrizesSaved: () => void
}) {
  const [editingPrizes, setEditingPrizes] = useState(false)
  const hasPrizes = PRIZE_SLOTS.some(({ key }) => (prizes?.[key]?.trim() ?? '') !== '')
  // Barra relativa al líder: el primero llena al 100% y el resto en proporción a
  // sus puntos. Visualiza la distancia en la tabla sin números extra.
  const top = entries[0]?.points ?? 0
  return (
    <section>
      <Row justify="between" align="center" gap={2}>
        <h2 className={styles.sectionTitle}>🏆 Clasificación general</h2>
        {/* Edición de premios discreta: solo el dueño, junto al título. Invita a
            añadir si aún no hay; si los hay, edita. El miembro no ve nada. */}
        {isOwner && (
          <button
            type="button"
            className={styles.editPrizesBtn}
            onClick={() => setEditingPrizes(true)}
          >
            🎁 {hasPrizes ? 'Editar premios' : 'Añadir premios'}
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
          <p className={styles.empty}>Aún no hay puntos. Jugad un reto para abrir la tabla.</p>
        </Card>
      ) : (
        <Card padding="none">
          <ol className={styles.ranking}>
            {entries.map((entry, i) => {
              const isMe = meId != null && entry.userId === meId
              const width = top > 0 ? Math.max(6, Math.round((entry.points / top) * 100)) : 0
              const prize = prizeForRow(prizes, i, entries.length)
              return (
                <li
                  key={entry.userId}
                  className={`${styles.rankRow} ${isMe ? styles.rankMe : ''}`}
                  // --i alimenta el retardo de la entrada escalonada (ver CSS).
                  style={{ '--i': i } as CSSProperties}
                >
                  <span className={`${styles.medal} ${medalClass(i)}`} aria-hidden="true">
                    {medal(i)}
                  </span>
                  <div className={styles.rankMid}>
                    <span className={styles.rankName}>
                      {entry.name}
                      {isMe && <span className={styles.youTag}>Tú</span>}
                    </span>
                    {prize && (
                      <span className={styles.prizeChip}>
                        <span aria-hidden="true">🎁</span> {prize}
                      </span>
                    )}
                    <span className={styles.rankBar} aria-hidden="true">
                      <i style={{ width: `${width}%` } as CSSProperties} />
                    </span>
                  </div>
                  <span className={styles.rankPoints}>{entry.points.toLocaleString('es-ES')}</span>
                </li>
              )
            })}
          </ol>
        </Card>
      )}
    </section>
  )
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
      title="🎁 Premios del grupo"
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
        {PRIZE_SLOTS.map(({ key, label }, i) => (
          <label key={key} className={styles.prizeField}>
            <span className={styles.prizeFieldLabel}>{label}</span>
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
  onDeleted,
  onEdit,
}: {
  challenges: ChallengeForPlay[]
  votesByChallenge: Map<string, VoteWithName[]>
  groupId: string
  userId?: string
  isOwner: boolean
  onDeleted: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  if (challenges.length === 0) return null
  return (
    <section>
      <h2 className={styles.sectionTitle}>🔴 En vivo ahora</h2>
      <Stack gap={3}>
        {challenges.map((c) => (
          <LiveCard
            key={c.id}
            challenge={c}
            votes={votesByChallenge.get(c.id) ?? []}
            groupId={groupId}
            userId={userId}
            isOwner={isOwner}
            onDeleted={onDeleted}
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
  onDeleted,
  onEdit,
}: {
  challenge: ChallengeForPlay
  votes: VoteWithName[]
  groupId: string
  userId?: string
  isOwner: boolean
  onDeleted: () => void
  onEdit: (challenge: ChallengeForPlay) => void
}) {
  const ranked = [...votes].sort((a, b) => b.points - a.points)
  const playHref = `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(challenge.id)}`
  // El voto del usuario actual (por user_id): si ya jugó, no puede re-jugar
  // aunque el reto siga en vivo. La identidad es la sesión.
  const myVote = userId ? votes.find((v) => v.user_id === userId) : undefined
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
                <span className={styles.scoreName}>{v.display_name}</span>
                <span className={styles.scorePoints}>{v.points.toLocaleString('es-ES')} pts</span>
              </li>
            ))}
          </ul>
        )}
        <Row gap={3} justify="between" align="center">
          {myVote ? (
            <p className={styles.played}>
              Ya jugaste · {myVote.points.toLocaleString('es-ES')} pts
            </p>
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

  return (
    <Card padding="none">
      <button className={styles.disclosure} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.challengeTitle}>{challenge.title}</span>
        <Row gap={2}>
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
              <RevealMap
                answer={answer}
                // Los votos de timeout no tienen pin (guess null): no se plotean.
                votes={ranked
                  .filter((v) => v.guess_lat != null && v.guess_lng != null)
                  .map((v) => ({
                    name: v.display_name,
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
                    <span className={styles.scoreName}>{v.display_name}</span>
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
