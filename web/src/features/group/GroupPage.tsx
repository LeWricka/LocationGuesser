import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Badge, Button, Card, Input, Row, Skeleton, Spinner, Stack, useToast } from '../../ui'
import { aggregateLeaderboard, getGroupVotes } from '../../lib/leaderboard'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import { getVotes } from '../../lib/votes'
import { fmtDist } from '../../lib/geo'
import { formatDeadline } from '../../lib/time'
import { getIdentity } from '../../lib/identity'
import type { Challenge, Vote } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import type { GroupInfo } from '../../lib/groupData'
import { challengeImageUrl, getGroup, getGroupChallenges, splitByStatus } from '../../lib/groupData'
import { CreateChallenge } from '../create/CreateChallenge'
import { RevealMap } from './RevealMap'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
}

/** Enlace del grupo (#g=) para compartir en el chat. */
function groupLink(groupId: string): string {
  return `${location.origin}${location.pathname}#g=${encodeURIComponent(groupId)}`
}

/** Enlace de un reto concreto (#g=…&c=…) para compartir tras crearlo. */
function challengeLink(groupId: string, challengeId: string): string {
  return `${groupLink(groupId)}&c=${encodeURIComponent(challengeId)}`
}

// Página del grupo ("el viaje"): clasificación general, retos en vivo y
// anteriores. Se refresca en tiempo real al entrar cualquier voto del grupo.
export function GroupPage({ groupId }: Props) {
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [votes, setVotes] = useState<Vote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // "Añadir reto" es un estado interno de la página (no una ruta nueva):
  // `adding` muestra el formulario; `created` muestra el reto recién creado con
  // su enlace para compartir, sin salir del grupo.
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState<Challenge | null>(null)
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

  // Carga inicial + Realtime en un solo efecto: el setState siempre ocurre tras
  // un await/callback (nunca síncrono en el cuerpo del efecto), así que las
  // cargas en cascada que advierte la regla no aplican aquí.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh es async: setState corre tras el fetch, no síncrono
    void refresh()
    const channel = supabase
      .channel(`group-${groupId}`)
      .on<Vote>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${groupId}` },
        (payload) => {
          // Solo los INSERT en vivo disparan aviso; la carga inicial no pasa por
          // aquí, así que no hay riesgo de avisar de votos antiguos.
          if (payload.eventType === 'INSERT') {
            const vote = payload.new
            if (vote.id && !announcedVotes.current.has(vote.id)) {
              announcedVotes.current.add(vote.id)
              const name = vote.player_name?.trim()
              toast.show(name ? `${name} acaba de votar` : 'Alguien acaba de votar', {
                tone: 'success',
              })
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

  // Votos agrupados por reto, para alimentar marcadores en vivo sin más fetches.
  const votesByChallenge = useMemo(() => {
    const map = new Map<string, Vote[]>()
    for (const v of votes ?? []) {
      const list = map.get(v.challenge_id)
      if (list) list.push(v)
      else map.set(v.challenge_id, [v])
    }
    return map
  }, [votes])

  const { live, past } = useMemo(() => splitByStatus(challenges ?? []), [challenges])

  // Añadir reto al grupo existente. Al terminar, refrescamos para que aparezca
  // en "en vivo" y mostramos el enlace del reto para compartir.
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
            <Button size="sm" onClick={() => setAdding(true)}>
              ➕ Añadir reto
            </Button>
          </Row>
        </header>

        {created && (
          <ChallengeCreated
            groupId={groupId}
            challenge={created}
            onDismiss={() => setCreated(null)}
          />
        )}

        <Leaderboard entries={leaderboard} />

        {hasChallenges ? (
          <>
            <LiveSection challenges={live} votesByChallenge={votesByChallenge} groupId={groupId} />
            <PastSection challenges={past} />
          </>
        ) : (
          <Card>
            <Stack gap={3} align="start">
              <p className={styles.empty}>Aún no hay retos — añade el primero.</p>
              <Button size="sm" onClick={() => setAdding(true)}>
                ➕ Añadir reto
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>
    </main>
  )
}

// Esqueleto de carga de la página del grupo: reproduce el layout real (cabecera
// + clasificación + tarjetas) con shimmer. Reduce la espera percibida frente a
// un spinner suelto (el ojo ya "lee" la estructura). role=status anuncia la
// carga al lector de pantalla; los bloques shimmer van aria-hidden.
function GroupSkeleton() {
  return (
    <main className="lg-page" role="status" aria-label="Cargando el viaje">
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
  challenge: Challenge
  onDismiss: () => void
}) {
  const toast = useToast()
  const link = challengeLink(groupId, challenge.id)
  const shareText = `🌍 ${challenge.title} — adivina dónde es${
    challenge.deadline_at ? ` (responde ${formatDeadline(challenge.deadline_at)})` : ''
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

// --- Clasificación general -------------------------------------------------

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <section>
      <h2 className={styles.sectionTitle}>🏆 Clasificación general</h2>
      {entries.length === 0 ? (
        <Card>
          <p className={styles.empty}>Aún no hay puntos. Jugad un reto para abrir la tabla.</p>
        </Card>
      ) : (
        <Card padding="none">
          <ol className={styles.ranking}>
            {entries.map((entry, i) => (
              <li
                key={entry.name}
                className={styles.rankRow}
                // --i alimenta el retardo de la entrada escalonada (ver CSS).
                style={{ '--i': i } as CSSProperties}
              >
                <span className={styles.rankPos} aria-hidden="true">
                  {medal(i)}
                </span>
                <span className={styles.rankName}>{entry.name}</span>
                <span className={styles.rankPlays}>
                  {entry.plays} {entry.plays === 1 ? 'reto' : 'retos'}
                </span>
                <span className={styles.rankPoints}>{entry.points.toLocaleString('es-ES')}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  )
}

function medal(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

// --- En vivo ---------------------------------------------------------------

function LiveSection({
  challenges,
  votesByChallenge,
  groupId,
}: {
  challenges: Challenge[]
  votesByChallenge: Map<string, Vote[]>
  groupId: string
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
}: {
  challenge: Challenge
  votes: Vote[]
  groupId: string
}) {
  const ranked = [...votes].sort((a, b) => b.points - a.points)
  const playHref = `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(challenge.id)}`
  // El voto del jugador actual (por nombre): si ya jugó, no puede re-jugar aunque
  // el reto siga en vivo. Comparamos por nombre, la identidad estable del juego.
  const myName = getIdentity()?.name?.trim()
  const myVote = myName ? votes.find((v) => v.player_name === myName) : undefined
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
                <span className={styles.scoreName}>{v.player_name}</span>
                <span className={styles.scorePoints}>{v.points.toLocaleString('es-ES')} pts</span>
              </li>
            ))}
          </ul>
        )}
        {myVote ? (
          <p className={styles.played}>Ya jugaste · {myVote.points.toLocaleString('es-ES')} pts</p>
        ) : (
          <a className={styles.playLink} href={playHref}>
            Jugar este reto →
          </a>
        )}
      </Stack>
    </Card>
  )
}

// --- Anteriores ------------------------------------------------------------

function PastSection({ challenges }: { challenges: Challenge[] }) {
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
            <PastCard key={c.id} challenge={c} />
          ))}
        </Stack>
      )}
    </section>
  )
}

// Reto cerrado: al desplegar se reconstruye (foto + ubicación real + votos).
// Cargamos los votos perezosamente al abrir para no traerlos todos de golpe.
function PastCard({ challenge }: { challenge: Challenge }) {
  const [open, setOpen] = useState(false)
  const [votes, setVotes] = useState<Vote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const imageUrl = challengeImageUrl(challenge.image_path)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && votes === null && !loading) {
      setLoading(true)
      getVotes(challenge.id)
        .then(setVotes)
        .finally(() => setLoading(false))
    }
  }

  const ranked = votes ? [...votes].sort((a, b) => b.points - a.points) : []

  return (
    <Card padding="none">
      <button className={styles.disclosure} onClick={toggle} aria-expanded={open}>
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
            <RevealMap
              answer={{ lat: challenge.lat, lng: challenge.lng }}
              votes={ranked.map((v) => ({
                name: v.player_name,
                lat: v.guess_lat,
                lng: v.guess_lng,
              }))}
            />
            {loading ? (
              <Row gap={2} justify="center">
                <Spinner />
                <span>Cargando votos…</span>
              </Row>
            ) : ranked.length === 0 ? (
              <p className={styles.empty}>Este reto se cerró sin votos.</p>
            ) : (
              <ul className={styles.scoreboard}>
                {ranked.map((v) => (
                  <li key={v.id} className={styles.scoreRow}>
                    <span className={styles.scoreName}>{v.player_name}</span>
                    <span className={styles.scoreDist}>{fmtDist(v.distance_km)}</span>
                    <span className={styles.scorePoints}>
                      {v.points.toLocaleString('es-ES')} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        </div>
      )}
    </Card>
  )
}
