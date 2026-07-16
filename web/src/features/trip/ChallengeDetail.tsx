import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, X } from 'lucide-react'
import { Avatar, Badge, ChallengePhoto, EmptyState, Icon, Spinner } from '../../ui'
import { Medal } from '../../ui/Medal'
import { AllGuessesMap, type GuessMarker } from '../group/AllGuessesMap'
import {
  getAnswer,
  getChallengeOrNull,
  getNumberAnswer,
  type ChallengeForPlay,
} from '../../lib/challenges'
import { getVotesWithNames } from '../../lib/votes'
import type { VoteWithName } from '../../lib/leaderboard'
import { getProfile } from '../../lib/profile'
import { signedImageUrl } from '../../lib/storage'
import { isLive } from '../../lib/groupData'
import { resolveMomentPhoto } from '../../lib/trip'
import { formatDeadlineDateTime } from '../../lib/time'
import { fmtDist, fmtNumber, type LatLng } from '../../lib/geo'
import styles from './ChallengeDetail.module.css'

interface Props {
  challengeId: string
  /** userId del usuario en sesión: resalta su fila en la clasificación y decide
   * el pin propio del mapa. Null en una sesión anónima sin cuenta. */
  myUserId: string | null
  onClose: () => void
}

type Phase = 'loading' | 'gone' | 'error' | 'ready'

interface ClassificationRow {
  userId: string
  name: string
  avatar: string | null
  points: number
  distanceKm: number | null
  guessNumber: number | null
  absError: number | null
  leftApp: boolean
  isMe: boolean
}

// Icono discreto "salió de la app durante la jugada" (issue #200) — mismo criterio
// que MarcadorTab (title + aria-label duplican el aviso para ratón y lector de
// pantalla). Se duplica aquí en vez de exportarlo: es un fragmento de ~10 líneas
// ya repetido en un par de sitios de la app (admin, marcador), no justifica un
// componente compartido propio.
function LeftAppFlag() {
  return (
    <span
      className={styles.leftAppFlag}
      title="Salió de la app durante la jugada"
      aria-label="Salió de la app durante la jugada"
    >
      <Icon icon={AlertTriangle} size={13} />
    </span>
  )
}

function classificationOf(votes: VoteWithName[], myUserId: string | null): ClassificationRow[] {
  return votes
    .map((v) => ({
      userId: v.user_id,
      name: v.display_name,
      avatar: v.avatar,
      points: v.points,
      distanceKm: v.distance_km,
      guessNumber: v.guess_number,
      absError: v.abs_error,
      leftApp: v.left_app,
      isMe: v.user_id === myUserId,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      // Empate a puntos: desempata quien cayó más cerca (distancia o error
      // absoluto, según el tipo de reto) — más informativo que el nombre.
      const aTie = a.distanceKm ?? a.absError
      const bTie = b.distanceKm ?? b.absError
      if (aTie != null && bTie != null && aTie !== bTie) return aTie - bTie
      if (aTie == null && bTie != null) return 1
      if (aTie != null && bTie == null) return -1
      return a.name.localeCompare(b.name)
    })
}

function guessMarkersOf(votes: VoteWithName[]): GuessMarker[] {
  return votes
    .filter(
      (v): v is VoteWithName & { guess_lat: number; guess_lng: number } =>
        v.guess_lat != null && v.guess_lng != null,
    )
    .map((v) => ({
      userId: v.user_id,
      name: v.display_name,
      avatar: v.avatar,
      lat: v.guess_lat,
      lng: v.guess_lng,
      points: v.points,
    }))
}

/**
 * Detalle completo de UN reto (issue #800), abierto desde "Retos anteriores" del
 * Marcador: clasificación DEL RETO (jugador → puntos → distancia, el propio
 * destacado), el mapa con las jugadas de TODOS (reusa `AllGuessesMap` del
 * revelado, #797) y la foto ampliable — título, quién lo creó y cuándo cierra/
 * cerró. Visual-first: mapa y foto protagonistas, la tabla compacta.
 *
 * Se basta a sí mismo (no depende de `useTripData`): pide sus propios datos por
 * `challengeId` — `getChallengeOrNull` (reto), `getVotesWithNames` (clasificación
 * + pines) y `getAnswer`/`getNumberAnswer` (respuesta, gobernada por RLS: solo
 * si el reto ya cerró o ya lo jugué). Anti-spoiler de la FOTO: mismo
 * `resolveMomentPhoto` que el resto de la app (Bitácora, Diario) — no una regla
 * nueva. Anti-spoiler del MAPA/número: si la RLS aún no sirve la respuesta
 * (reto propio EN JUEGO, p.ej.), no hay mapa/cifra que pintar — nota en su lugar
 * en vez de reventar (la lista de "Retos anteriores" ya evita mandar aquí un
 * reto EN JUEGO sin jugar; esto es una defensa extra, no el camino normal).
 */
export function ChallengeDetail({ challengeId, myUserId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [challenge, setChallenge] = useState<ChallengeForPlay | null>(null)
  const [votes, setVotes] = useState<VoteWithName[]>([])
  const [answer, setAnswer] = useState<LatLng | null>(null)
  const [numberAnswer, setNumberAnswer] = useState<number | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [creatorName, setCreatorName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Reinicio síncrono al cambiar de `challengeId` (p.ej. abrir otro reto sin
    // desmontar): sin esto, el detalle anterior quedaría en pantalla mientras
    // llega el nuevo fetch. No es un bucle: corre una vez por cambio de id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('loading')

    void (async () => {
      try {
        const ch = await getChallengeOrNull(challengeId)
        if (cancelled) return
        if (!ch) {
          setPhase('gone')
          return
        }
        const [v, a, na, img, creator] = await Promise.all([
          getVotesWithNames(challengeId),
          getAnswer(challengeId),
          getNumberAnswer(challengeId),
          ch.image_path ? signedImageUrl(ch.image_path) : Promise.resolve(null),
          getProfile(ch.created_by),
        ])
        if (cancelled) return
        setChallenge(ch)
        setVotes(v)
        setAnswer(a)
        setNumberAnswer(na)
        setImageUrl(img)
        setCreatorName(creator?.display_name ?? null)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [challengeId])

  // Escape cierra el detalle (mismo gesto que TripWrap/MomentSheet).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const closed = challenge != null && !isLive(challenge)
  const isOwn = challenge != null && myUserId != null && challenge.created_by === myUserId
  const isNumberChallenge = challenge?.challenge_kind === 'number'

  const photoDisplay = challenge
    ? resolveMomentPhoto({
        isChallenge: challenge.is_challenge,
        status: closed ? 'closed' : 'active',
        photoIsHint: challenge.photo_is_hint,
        isOwn,
        imageUrl,
      })
    : { src: null, surprise: false }

  const classification = classificationOf(votes, myUserId)
  const guesses = guessMarkersOf(votes)

  const heading = challenge
    ? isNumberChallenge
      ? (challenge.number_question ?? challenge.title)
      : challenge.title
    : ''

  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label={challenge ? `Detalle de ${challenge.title}` : 'Detalle del reto'}
    >
      <button
        type="button"
        className={[styles.close, 'lg-press'].join(' ')}
        onClick={onClose}
        aria-label="Cerrar detalle del reto"
      >
        <Icon icon={X} size={20} />
      </button>

      <div className={`${styles.scroll} lg-stagger`}>
        {phase === 'loading' && (
          <div className={styles.loading} role="status" aria-label="Cargando el reto">
            <Spinner size={28} />
          </div>
        )}

        {phase === 'gone' && (
          <EmptyState
            tone="muted"
            title="Este reto ya no existe"
            description="Puede que se haya borrado."
            className={styles.state}
          />
        )}

        {phase === 'error' && (
          <EmptyState
            tone="danger"
            title="No hemos podido cargar el reto"
            description="Reintenta en un momento."
            className={styles.state}
          />
        )}

        {phase === 'ready' && challenge && (
          <>
            <header className={styles.head}>
              {closed ? (
                <Badge tone="neutral">Cerrado</Badge>
              ) : (
                <Badge tone="live" dot>
                  EN JUEGO
                </Badge>
              )}
              <h1 className={styles.title}>{heading}</h1>
              <p className={styles.meta}>
                Creado por <strong>{isOwn ? 'ti' : (creatorName ?? '—')}</strong>
                {challenge.deadline_at && (
                  <>
                    {' · '}
                    <Icon icon={Clock} size={13} className={styles.metaIcon} />
                    {closed ? 'Cerró' : 'Cierra'} el {formatDeadlineDateTime(challenge.deadline_at)}
                  </>
                )}
              </p>
            </header>

            {/* Foto protagonista (issue #800, visual-first): ampliable — ChallengePhoto
                ya integra `Lightbox` (zoomable por defecto), no hace falta cablearlo
                aparte. Mismo anti-spoiler que el resto de la app: si sigue oculta cae
                al placeholder de marca, nunca revienta la sorpresa. */}
            <ChallengePhoto
              src={photoDisplay.src}
              alt={challenge.title}
              ratio="wide"
              size="lg"
              className={styles.photo}
            />

            {isNumberChallenge ? (
              <section className={styles.numberAnswer} aria-label="Respuesta correcta">
                {numberAnswer != null ? (
                  <p>
                    La respuesta era{' '}
                    <strong>
                      {fmtNumber(numberAnswer, challenge.number_decimals, challenge.number_unit)}
                    </strong>
                  </p>
                ) : (
                  <p>La respuesta se revela al cerrarse el reto.</p>
                )}
              </section>
            ) : (
              // Mapa con las jugadas de TODOS (issue #800: reusa `AllGuessesMap` del
              // revelado, #797 — solo import). Sin respuesta (RLS: reto propio EN
              // JUEGO) no hay mapa que pintar; nota en su lugar.
              <div className={styles.mapWrap}>
                {answer ? (
                  <AllGuessesMap
                    answer={answer}
                    guesses={guesses}
                    meUserId={myUserId ?? undefined}
                  />
                ) : (
                  <div className={styles.mapPending}>
                    <p>El mapa se revela al cerrarse el reto.</p>
                  </div>
                )}
              </div>
            )}

            {/* Clasificación DEL RETO (issue #800): jugador → puntos → distancia,
                ordenado, el propio destacado. Tabla compacta: el mapa y la foto son
                los protagonistas, esto es dato de apoyo. */}
            <section className={styles.board} aria-label="Clasificación del reto">
              <h2 className={styles.boardTitle}>
                Clasificación
                {classification.length > 0 && (
                  <span className={styles.boardCount}>
                    {' · '}
                    {classification.length} {classification.length === 1 ? 'jugador' : 'jugadores'}
                  </span>
                )}
              </h2>
              {classification.length === 0 ? (
                <p className={styles.boardEmpty}>
                  {closed ? 'Se cerró sin votos.' : 'Nadie ha jugado todavía.'}
                </p>
              ) : (
                <ol className={styles.boardList}>
                  {classification.map((row, i) => (
                    <li
                      key={row.userId}
                      className={[styles.boardRow, row.isMe ? styles.boardRowMine : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className={styles.boardRank} aria-hidden="true">
                        {i < 3 ? (
                          <Medal rank={(i + 1) as 1 | 2 | 3} size={18} />
                        ) : (
                          <span className={styles.boardRankNum}>{i + 1}</span>
                        )}
                      </span>
                      <Avatar
                        userId={row.userId}
                        avatarUrl={row.avatar}
                        name={row.name}
                        size="sm"
                      />
                      <span className={styles.boardName}>
                        {row.name}
                        {row.isMe && <span className={styles.boardMeTag}>Tú</span>}
                        {row.leftApp && <LeftAppFlag />}
                      </span>
                      <span className={styles.boardPoints}>
                        {row.points.toLocaleString('es-ES')} pts
                      </span>
                      <span className={styles.boardDetail}>
                        {isNumberChallenge
                          ? row.guessNumber != null
                            ? fmtNumber(
                                row.guessNumber,
                                challenge.number_decimals,
                                challenge.number_unit,
                              )
                            : '—'
                          : row.distanceKm != null
                            ? fmtDist(row.distanceKm)
                            : '—'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
