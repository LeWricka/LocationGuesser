import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Card, Row, Spinner, Stack, useToast } from '../../ui'
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
import { RevealMap } from './RevealMap'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
}

// Página del grupo ("el viaje"): clasificación general, retos en vivo y
// anteriores. Se refresca en tiempo real al entrar cualquier voto del grupo.
export function GroupPage({ groupId }: Props) {
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [votes, setVotes] = useState<Vote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    return (
      <main className="lg-page">
        <Row gap={2} justify="center">
          <Spinner />
          <span>Cargando el viaje…</span>
        </Row>
      </main>
    )
  }

  return (
    <main className="lg-page">
      <Stack gap={6}>
        <header>
          <h1 className={styles.title}>{group?.name?.trim() || groupId}</h1>
          {/* El código siempre visible (en secundario) para poder compartirlo. */}
          <p className={styles.code}>Código {groupId}</p>
        </header>

        <Leaderboard entries={leaderboard} />

        <LiveSection challenges={live} votesByChallenge={votesByChallenge} groupId={groupId} />

        <PastSection challenges={past} />
      </Stack>
    </main>
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
              <li key={entry.name} className={styles.rankRow}>
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
