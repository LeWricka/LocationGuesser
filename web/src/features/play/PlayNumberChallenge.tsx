import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Ghost,
  Hash,
  Lock,
  RotateCcw,
  Timer,
  TimerOff,
} from 'lucide-react'
import { useVisualViewport } from '../../lib/useVisualViewport'
import { marcadorGroupHash } from '../../lib/route'
import { CountdownOverlay } from './CountdownOverlay'
import { ExitConfirmModal } from './ExitConfirmModal'
import { RevealBurst } from './RevealBurst'
import { NumberPad } from './NumberPad'
import { SceneImage } from './SceneImage'
import { remainingSeconds } from './resumeState'
import {
  getNumberAnswer,
  getChallengeOrNull,
  isPracticeChallenge,
  type ChallengeForPlay,
} from '../../lib/challenges'
import { deleteMyVote, getExistingVote, getVotesWithNames, submitNumberVote } from '../../lib/votes'
import type { VoteWithName } from '../../lib/leaderboard'
import { fmtNumber, signedRelErrorPct } from '../../lib/geo'
import { track } from '../../lib/analytics'
import { ChallengeClosedError, describeError, ResourceGoneError } from '../../lib/errors'
import { addBreadcrumb, reportError } from '../../lib/observability'
import { useSession } from '../../lib/session-context'
import { useSignedImage } from '../../lib/useSignedImage'
import { useOwnChallengeGuard } from './useOwnChallengeGuard'
import { describeChallengeClosure, isChallengeClosed } from './challengeClosure'
// Pre-prompt de push (issue #769): tras revelar, SOLO para cuentas. Este reto
// (a diferencia de PlayChallenge) no tiene hoy CTA de "guárdate" para el
// anónimo; el guard `!isAnonymous` de abajo evita mostrar el prompt de push a
// quien no tiene aún ni cuenta ni identidad guardada.
import { PushOptInPrompt } from '../trip/PushOptInPrompt'
import { AppHeader } from '../../ui/AppHeader'
import {
  Avatar,
  BackHomeButton,
  Button,
  Card,
  CountdownRing,
  CountUp,
  Icon,
  Modal,
  ScoreRing,
  Skeleton,
  Spinner,
  Stack,
  useReducedMotion,
  useToast,
} from '../../ui'
import { IconDiana } from '../../ui/icons'
import styles from './PlayNumberChallenge.module.css'

const MAX_POINTS = 5000
const GREAT_SHOT = MAX_POINTS * 0.75

interface Props {
  challengeId: string
  groupId?: string
  /** Reto ya cargado por el dispatcher (evita refetch); si falta, se carga aquí. */
  preloaded?: ChallengeForPlay
}

// `own` es la guarda defensiva (#509): el creador del reto no juega el suyo
// propio, ni aunque llegue aquí directamente (sin pasar por el guard de
// PlayChallenge, que ya corta antes de delegar). `gone` (issue #760): el reto
// se borró entre que se compartió el enlace y que se abrió/jugó — pantalla
// amable, no un error crudo. Ver la HERMANA de este tipo en PlayChallenge.
type Phase = 'loading' | 'idle' | 'countdown' | 'playing' | 'revealed' | 'own' | 'gone' | 'closed'

const startKey = (challengeId: string) => `lg.play.startAt.${challengeId}`

// Resultado del voto de número ya revelado (mío). `null` distingue "sin resultado".
interface NumberResult {
  guess: number
  absError: number
  points: number
  answer: number
}

function haptic(pattern: number | number[]) {
  navigator.vibrate?.(pattern)
}

// Parsea la adivinanza tecleada (es-ES: coma decimal) a número, o null si vacía/no
// válida. El teclado ya limita a dígitos + una coma, así que basta normalizar.
function parseGuess(raw: string): number | null {
  const cleaned = raw.trim()
  if (cleaned === '' || cleaned === ',') return null
  const value = Number(cleaned.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

// JUGAR un reto de NÚMERO ("¿Adivinas?", #323). HERMANO de PlayChallenge pero SIN
// mapa: foto + pregunta + teclado numérico propio; al bloquear el número llama a la
// RPC `submit_number_vote` (autoridad de servidor). La cifra correcta NO viaja al
// cliente hasta votar (vive en challenge_answers, RLS). Mismo lenguaje de fases,
// cuenta atrás 3·2·1, anti-trampa y "volver a jugar" (solo práctica) que el de lugar.
export function PlayNumberChallenge({ challengeId, groupId, preloaded }: Props) {
  const [phase, setPhase] = useState<Phase>(preloaded ? 'idle' : 'loading')
  const [challenge, setChallenge] = useState<ChallengeForPlay | null>(preloaded ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [guessRaw, setGuessRaw] = useState('')
  const [result, setResult] = useState<NumberResult | null>(null)
  const [answer, setAnswer] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [iLeftApp, setILeftApp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [votes, setVotes] = useState<VoteWithName[]>([])
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null)
  // Guarda "es tuyo" (#509), compartida con PlayChallenge (#579): el creador
  // ve cuánta gente ha jugado ya, sin entrar al juego.
  const { ownVoteCount, checkOwn } = useOwnChallengeGuard(getVotesWithNames)
  // Confirmación de "salir mientras juegas" (issue #663): sustituye window.confirm
  // por el modal del UI kit (ver ExitConfirmModal).
  const [confirmingExit, setConfirmingExit] = useState(false)

  const toast = useToast()
  const { user, isAnonymous } = useSession()
  const reducedMotion = useReducedMotion()
  const reducedMotionRef = useRef(reducedMotion)
  useEffect(() => {
    reducedMotionRef.current = reducedMotion
  }, [reducedMotion])

  const leftAppRef = useRef(false)
  const playStartAtRef = useRef<number | null>(null)
  const photoUrl = useSignedImage(challenge?.image_path ?? null)
  // Alto visible real (visualViewport): cuando el chrome del navegador móvil recorta
  // la pantalla, fijamos el contenedor inmersivo a ese alto en px (no a 100vh, que
  // colapsa). Aquí el teclado del SISTEMA no se abre (input propio), pero la barra
  // del navegador sí mueve el alto: con esto la hoja del número y la pregunta no se
  // salen nunca.
  const { height: visualHeight } = useVisualViewport()

  const guessNumber = parseGuess(guessRaw)
  const unit = challenge?.number_unit ?? null
  const decimals = challenge?.number_decimals ?? 0

  // Revelar: emite el voto vía la RPC `submit_number_vote` y usa SU resultado (error,
  // puntos y la cifra correcta) para revelar. El cliente NO calcula puntos ni conoce
  // la cifra de antemano. Sin número (timeout) → 0 pts, sin revelado de cifra.
  const reveal = useCallback(
    async (current: ChallengeForPlay, played: number | null) => {
      setPhase('revealed')
      localStorage.removeItem(startKey(current.id))

      if (!user) {
        if (played == null) setTimedOut(true)
        toast.show('No se guardó tu voto (sin sesión)', { tone: 'neutral' })
        return
      }

      setSaving(true)
      const leftApp = leftAppRef.current
      if (leftApp) setILeftApp(true)
      const startedAt = playStartAtRef.current
      const elapsedSeconds = startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : null
      try {
        const res = await submitNumberVote({
          challengeId: current.id,
          guess: played,
          leftApp,
          elapsedSeconds,
        })
        if (played == null) {
          setTimedOut(true)
          track('result_revealed', {
            group_id: current.group_id,
            challenge_id: current.id,
            challenge_kind: 'number',
            timed_out: true,
            points: 0,
            is_anonymous: isAnonymous,
          })
          return
        }
        if (res.answerNumber != null && res.absError != null) {
          setAnswer(res.answerNumber)
          setResult({
            guess: played,
            absError: res.absError,
            points: res.points,
            answer: res.answerNumber,
          })
        }
        if (res.points >= GREAT_SHOT && !reducedMotionRef.current) haptic([100, 50, 100])
        // Marcador del reto: votos con nombre, ordenados por puntos. Falla en silencio.
        let rankPosition: number | null = null
        try {
          const vs = await getVotesWithNames(current.id)
          setVotes(vs)
          if (vs.length > 0) {
            rankPosition = 1 + vs.filter((v) => v.points > res.points).length
            setRank({ position: rankPosition, total: vs.length })
          }
        } catch {
          // Sin marcador: el revelado se muestra igual.
        }
        track('result_revealed', {
          group_id: current.group_id,
          challenge_id: current.id,
          challenge_kind: 'number',
          timed_out: false,
          points: res.points,
          is_anonymous: isAnonymous,
          ...(rankPosition != null && { rank_in_challenge: rankPosition }),
        })
        toast.show('¡Número bloqueado!', { tone: 'success' })
      } catch (err) {
        if (err instanceof ResourceGoneError) {
          // Esperable (issue #760): el reto se borró con la pantalla de jugar ya
          // abierta. Breadcrumb, no excepción — no es un fallo real de la app.
          addBreadcrumb('challenge_gone_on_vote', { challengeId: current.id, kind: 'number' })
          setPhase('gone')
          return
        }
        if (err instanceof ChallengeClosedError) {
          // Esperable (LOCATIONGUESSER-8): el plazo venció con la pantalla abierta.
          addBreadcrumb('challenge_closed_on_vote', { challengeId: current.id, kind: 'number' })
          setPhase('closed')
          return
        }
        reportError(err, { area: 'submit_number_vote', challengeId: current.id })
        if (played == null) {
          setTimedOut(true)
          return
        }
        toast.show(`No se pudo guardar: ${describeError(err)}`, { tone: 'danger' })
      } finally {
        setSaving(false)
      }
    },
    [toast, user, isAnonymous],
  )

  // Carga del reto (si no vino preloaded) + estado del voto previo.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = preloaded ?? (await getChallengeOrNull(challengeId))
        if (cancelled) return
        if (!c) {
          // Esperable (issue #760): el dueño borró el reto tras compartir el
          // enlace. Breadcrumb, no excepción.
          addBreadcrumb('challenge_gone_on_load', { challengeId, kind: 'number' })
          setPhase('gone')
          return
        }
        setChallenge(c)

        // Guarda defensiva (#509): el creador no juega su propio reto. En el flujo
        // real, PlayChallenge ya corta antes de delegar aquí; esto cubre el caso de
        // llegar a este componente directamente (sin ese guard por delante).
        if (await checkOwn(c, user?.id, { isCancelled: () => cancelled })) {
          if (!cancelled) setPhase('own')
          return
        }

        const existing = user ? await getExistingVote(challengeId, user.id) : null
        if (cancelled) return
        if (existing) {
          if (existing.left_app) setILeftApp(true)
          if (existing.guess_number == null) {
            setTimedOut(true)
          } else {
            const ans = await getNumberAnswer(challengeId)
            if (cancelled) return
            if (ans != null) {
              setAnswer(ans)
              setResult({
                guess: existing.guess_number,
                absError: existing.abs_error ?? Math.abs(existing.guess_number - ans),
                points: existing.points,
                answer: ans,
              })
            }
            try {
              const vs = await getVotesWithNames(challengeId)
              if (!cancelled && vs.length > 0) {
                setVotes(vs)
                setRank({
                  position: 1 + vs.filter((v) => v.points > existing.points).length,
                  total: vs.length,
                })
              }
            } catch {
              // Sin marcador: el resultado se muestra igual.
            }
          }
          setPhase('revealed')
          return
        }
        // Reto ya CERRADO y sin voto propio (LOCATIONGUESSER-8): espejo cliente
        // de la guarda `v_open` de la RPC — no se entra a jugar un reto vencido.
        if (isChallengeClosed(c.deadline_at)) {
          addBreadcrumb('challenge_closed_on_load', { challengeId, kind: 'number' })
          setPhase('closed')
          return
        }
        const resuming = localStorage.getItem(startKey(c.id)) != null
        setPhase(resuming ? 'playing' : 'idle')
        // Entró a la pantalla del reto SIN haber votado aún (issue #751): mide la
        // caída "entró pero no jugó" (challenge_opened → challenge_played).
        track('challenge_opened', {
          group_id: c.group_id,
          challenge_id: c.id,
          challenge_kind: 'number',
        })
      } catch (err) {
        if (cancelled) return
        reportError(err, { area: 'load_number_challenge', challengeId })
        setLoadError(describeError(err))
        setPhase('loading')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [challengeId, user, preloaded, checkOwn])

  // Inicio del cronómetro de respuesta (wall-clock desde el start_at persistido).
  useEffect(() => {
    if (phase !== 'playing' || !challenge) return
    const startAt = Number(localStorage.getItem(startKey(challenge.id)) ?? Date.now())
    playStartAtRef.current = startAt
  }, [phase, challenge])

  // Cuenta atrás de la jugada (si hay límite). Al llegar a 0 → revelar (timeout).
  useEffect(() => {
    if (phase !== 'playing' || !challenge || challenge.guess_seconds == null) return
    const total = challenge.guess_seconds
    const startAt = Number(localStorage.getItem(startKey(challenge.id)) ?? Date.now())
    const tick = () => {
      const left = remainingSeconds(total, startAt, Date.now())
      setRemaining(left)
      if (left <= 0) void reveal(challenge, guessNumber)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, challenge, guessNumber, reveal])

  // Anti-trampa: si la pestaña se oculta durante `playing`, marcamos el ref.
  useEffect(() => {
    if (phase !== 'playing') return
    const onVisibility = () => {
      if (document.hidden) leftAppRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [phase])

  function start() {
    if (!challenge) return
    setPhase('countdown')
  }
  function beginPlaying() {
    if (!challenge) return
    localStorage.setItem(startKey(challenge.id), String(Date.now()))
    setPhase('playing')
  }
  function lockNumber() {
    if (challenge && guessNumber != null) {
      track('challenge_played', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
        challenge_kind: 'number',
        is_anonymous: isAnonymous,
      })
      void reveal(challenge, guessNumber)
    }
  }

  function goBack() {
    location.hash = groupId ? `#g=${groupId}` : ''
  }
  function goBackWhilePlaying() {
    setConfirmingExit(true)
  }

  function confirmExit() {
    setConfirmingExit(false)
    goBack()
  }

  async function replay() {
    if (!challenge) return
    try {
      await deleteMyVote(challenge.id)
      localStorage.removeItem(startKey(challenge.id))
      setGuessRaw('')
      setResult(null)
      setAnswer(null)
      setRemaining(null)
      setTimedOut(false)
      leftAppRef.current = false
      playStartAtRef.current = null
      setILeftApp(false)
      setRank(null)
      setVotes([])
      setSaving(false)
      setPhase('idle')
      track('challenge_replayed', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
        challenge_kind: 'number',
      })
    } catch (err) {
      reportError(err, { area: 'replay_number_challenge', challengeId: challenge.id })
      toast.show(`No se pudo reiniciar: ${describeError(err)}`, { tone: 'danger' })
    }
  }

  if (loadError) {
    return (
      <main className="lg-page">
        <Stack gap={4}>
          <BackHomeButton onClick={goBack} label={groupId ? 'Volver al viaje' : 'Inicio'} />
          <Card padding="md">
            <Stack gap={2}>
              <strong>No se pudo cargar el reto.</strong>
              <span className={styles.status}>{loadError}</span>
            </Stack>
          </Card>
        </Stack>
      </main>
    )
  }

  // Guarda "es tuyo" (#509): el creador no juega su propio reto. Hallazgo #4
  // (auditoría de retos, #579): antes la tarjeta quedaba pegada arriba con 2/3
  // de pantalla en blanco. El "atrás" queda anclado arriba; el bloque
  // informativo se centra en el espacio restante y suma un mini-resumen del
  // estado (cierra en X / cerrado), además del recuento de jugadas que ya tenía.
  if (phase === 'own' && challenge) {
    const backLabelOwn = groupId ? 'Volver al viaje' : 'Inicio'
    return (
      <main className={`lg-page ${styles.ownPage}`}>
        <BackHomeButton onClick={goBack} label={backLabelOwn} />
        <div className={styles.ownCenter}>
          <Card padding="md" raised>
            <Stack gap={3} align="center">
              <Icon icon={Hash} size={40} />
              <strong>Este reto es tuyo</strong>
              <p className={styles.status}>
                Lo creaste tú: ya conoces la respuesta, así que no puedes jugarlo.
              </p>
              <p className={styles.status}>{describeChallengeClosure(challenge.deadline_at)}</p>
              {ownVoteCount != null && (
                <p className={styles.status}>
                  {ownVoteCount === 0
                    ? 'Nadie ha votado todavía.'
                    : `${ownVoteCount} ${ownVoteCount === 1 ? 'persona ha votado' : 'personas han votado'}.`}
                </p>
              )}
              {groupId && (
                <Button
                  fullWidth
                  size="lg"
                  onClick={() => {
                    location.hash = marcadorGroupHash(groupId)
                  }}
                >
                  Ver marcador
                </Button>
              )}
              <Button variant="secondary" fullWidth onClick={goBack}>
                Volver al viaje
              </Button>
            </Stack>
          </Card>
        </div>
      </main>
    )
  }

  // Reto borrado (issue #760): el dueño lo borró tras compartir el enlace (al
  // cargar) o mientras la pantalla estaba abierta (al bloquear el número). Va
  // ANTES del resto de fases: en `gone`, `challenge` puede ser `null`, así que
  // el copy no depende de él — mismo patrón visual que la guarda "es tuyo".
  if (phase === 'gone') {
    const backLabelGone = groupId ? 'Volver al viaje' : 'Inicio'
    return (
      <main className={`lg-page ${styles.ownPage}`}>
        <BackHomeButton onClick={goBack} label={backLabelGone} />
        <div className={styles.ownCenter}>
          <Card padding="md" raised>
            <Stack gap={3} align="center">
              <Icon icon={Ghost} size={40} />
              <strong>Este reto ya no existe</strong>
              <p className={styles.status}>Puede que quien lo compartió lo haya borrado.</p>
              <Button fullWidth size="lg" onClick={goBack}>
                {backLabelGone}
              </Button>
            </Stack>
          </Card>
        </div>
      </main>
    )
  }

  // Reto CERRADO sin voto propio (LOCATIONGUESSER-8): mismo patrón de tarjeta
  // que `gone`; los resultados viven en el marcador del viaje.
  if (phase === 'closed') {
    const backLabelClosed = groupId ? 'Volver al viaje' : 'Inicio'
    return (
      <main className={`lg-page ${styles.ownPage}`}>
        <BackHomeButton onClick={goBack} label={backLabelClosed} />
        <div className={styles.ownCenter}>
          <Card padding="md" raised>
            <Stack gap={3} align="center">
              <Icon icon={Lock} size={40} />
              <strong>Este reto ya está cerrado</strong>
              <p className={styles.status}>
                Se acabó el tiempo para jugarlo. El marcador del viaje tiene los resultados.
              </p>
              <Button fullWidth size="lg" onClick={goBack}>
                {backLabelClosed}
              </Button>
            </Stack>
          </Card>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !challenge) {
    return (
      <main className="lg-page" role="status" aria-label="Cargando el reto">
        <Stack gap={4}>
          <Skeleton width="55%" height={28} radius="md" />
          <Skeleton width="100%" height="46svh" radius="lg" />
          <Skeleton width="100%" height={52} radius="sm" />
        </Stack>
      </main>
    )
  }

  const backLabel = groupId ? 'Volver al viaje' : 'Inicio'
  const isPractice = isPracticeChallenge(challenge.deadline_at)
  const question = challenge.number_question ?? challenge.title
  const revealed = phase === 'revealed'

  // --------------------------------------------------------------------------
  // Fase JUGAR (idle/countdown/playing): foto + pregunta + teclado a pantalla
  // completa. La foto/escena solo se monta en `playing` (no-spoiler antes de
  // Empezar no aplica a la cifra —vive en el servidor— pero mantenemos el patrón).
  // --------------------------------------------------------------------------
  if (!revealed) {
    const playing = phase === 'playing'
    const urgent = remaining != null && remaining <= 10
    // Modelo de viewport: fijamos el alto del contenedor al alto VISIBLE real en px
    // cuando lo conocemos (fallback a 100dvh en CSS). Así el chrome del navegador no
    // colapsa el layout y la pregunta/hoja no se salen de pantalla.
    const immersiveStyle = visualHeight != null ? { '--play-vh': `${visualHeight}px` } : undefined
    return (
      <>
        <div className={styles.immersive} style={immersiveStyle as React.CSSProperties | undefined}>
          {/* Cabecera flotante: atrás + cronómetro (si hay límite). */}
          <AppHeader
            variant="floating"
            lead="back"
            leadLabel={playing ? 'Salir (sigue el tiempo)' : backLabel}
            onLead={playing ? goBackWhilePlaying : goBack}
            action={
              playing && remaining != null && challenge.guess_seconds != null ? (
                <CountdownRing
                  remaining={remaining}
                  total={challenge.guess_seconds}
                  urgent={urgent}
                />
              ) : undefined
            }
          />

          {/* Escena-hero con la pregunta SIEMPRE visible anclada abajo. Alto mínimo
              en px: no colapsa al reajustarse el viewport. */}
          <div className={styles.scene}>
            {photoUrl ? (
              <SceneImage src={photoUrl} alt={question} className={styles.sceneImg} />
            ) : (
              <div className={styles.sceneNeutral} aria-hidden />
            )}
            <div className={styles.sceneVeil} aria-hidden />
            <div className={styles.questionWrap}>
              <span className={styles.kindChip}>
                <Icon icon={Hash} size={13} /> ¿Adivinas?
              </span>
              <p className={styles.question}>{question}</p>
            </div>
          </div>

          {/* Hoja inferior, UNA columna: número grande + unidad ENCIMA del teclado,
              luego el teclado propio y la acción anclada con safe-area. */}
          <section className={styles.sheet} aria-hidden={!playing}>
            <span className={styles.fieldLabel}>Tu respuesta</span>
            <div className={styles.guessRow}>
              <span className={styles.guessNum}>{guessRaw || '0'}</span>
              {unit && <span className={styles.guessUnit}>{unit}</span>}
              <span className={styles.caret} aria-hidden />
            </div>
            <NumberPad value={guessRaw} onChange={setGuessRaw} disabled={!playing} />
            <Button
              size="lg"
              fullWidth
              disabled={!playing || guessNumber == null}
              onClick={lockNumber}
            >
              <span className={styles.btnIcon}>
                <Icon icon={Lock} size={18} /> Bloquear mi respuesta
              </span>
            </Button>
          </section>

          {/* Overlay "Empezar" (fase idle). */}
          <Modal
            open={phase === 'idle'}
            onClose={goBack}
            title="¿Listo para jugar?"
            footer={
              <Button size="lg" fullWidth onClick={start}>
                Empezar
              </Button>
            }
          >
            {/* Anticipación, no explicación (#545): diana generosa con un pulso
                ACOTADO (2 pasadas, nunca infinito) + UNA línea. El límite de tiempo,
                si lo hay, es un chip (dato), no una frase. Mismo patrón que el reto
                de lugar (PlayChallenge). */}
            <div className={styles.startBody}>
              <Stack gap={3} align="center">
                <IconDiana size={64} className={styles.introIcon} />
                <p className={styles.introLine}>Lee la pregunta y teclea tu número</p>
                {challenge.guess_seconds != null && (
                  <span className={styles.introTimeChip}>
                    <Icon icon={Timer} size={14} />
                    {challenge.guess_seconds} s
                  </span>
                )}
              </Stack>
            </div>
          </Modal>
        </div>

        {phase === 'countdown' && <CountdownOverlay photoUrl={photoUrl} onDone={beginPlaying} />}

        <ExitConfirmModal
          open={confirmingExit}
          timed={challenge.guess_seconds != null}
          onConfirm={confirmExit}
          onCancel={() => setConfirmingExit(false)}
        />
      </>
    )
  }

  // --------------------------------------------------------------------------
  // Fase REVELADA: cifra correcta grande sobre la foto + tu error + puntos +
  // marcador del reto ordenado por puntos (número y error relativo por jugador).
  // --------------------------------------------------------------------------
  const ranked = [...votes].sort((a, b) => b.points - a.points)
  return (
    <main className="lg-page">
      <Stack gap={4}>
        <BackHomeButton onClick={goBack} label={backLabel} />

        {/* Revelado de la cifra sobre la foto. */}
        <div className={`${styles.revealHead} lg-rise`}>
          {photoUrl ? (
            <SceneImage src={photoUrl} alt={question} className={styles.revealImg} />
          ) : (
            <div className={styles.sceneNeutral} aria-hidden />
          )}
          <div className={styles.revealVeil} aria-hidden />
          <div className={styles.revealInner}>
            {answer != null ? (
              <>
                <span className={styles.revealLabel}>La respuesta era</span>
                <span className={styles.revealNum}>{fmtNumber(answer, decimals, unit)}</span>
              </>
            ) : (
              <span className={styles.revealLabel}>Revelado</span>
            )}
          </div>
        </div>

        <Card padding="md" raised>
          <Stack gap={4}>
            {timedOut ? (
              <Stack gap={2}>
                <strong className={styles.inlineIcon}>
                  <Icon icon={TimerOff} size={18} /> No diste a tiempo
                </strong>
                <span className={styles.status}>
                  Se acabó el tiempo antes de bloquear tu número.
                </span>
              </Stack>
            ) : result ? (
              <Stack gap={4} align="center" className={styles.scoreReveal}>
                <RevealBurst active={result.points >= GREAT_SHOT} />
                <span
                  className={`${styles.scoreEyebrow} ${styles.eyebrowIn} ${
                    result.points >= GREAT_SHOT ? styles.scoreEyebrowWin : ''
                  }`}
                >
                  {result.points >= GREAT_SHOT ? '¡Casi lo clavas!' : 'Resultado'}
                </span>
                {/* El anillo entra envuelto (no vía su propio `className`): ScoreRing
                    ya usa esa prop para `.high` (pulso infinito de gran tiro), que
                    competiría por la propiedad `animation` con la entrada. */}
                <div className={styles.ringIn}>
                  <ScoreRing value={result.points} max={MAX_POINTS} size={168}>
                    <CountUp className={styles.ringPoints} value={result.points} duration={1200} />
                    <span className={styles.ringUnit}>puntos</span>
                  </ScoreRing>
                </div>
                <div className={styles.scoreText}>
                  <span className={`${styles.scoreLabel} ${styles.verdictIn}`}>
                    Dijiste <strong>{fmtNumber(result.guess, decimals, unit)}</strong>
                  </span>
                  <span className={`${styles.resultErr} ${styles.distIn}`}>
                    te fuiste {fmtNumber(result.absError, decimals, unit)} (
                    {signedRelErrorPct(result.guess, result.answer)})
                  </span>
                  {rank && (
                    <span className={`${styles.rank} ${styles.distIn}`}>
                      {rank.position}º de {rank.total}
                    </span>
                  )}
                </div>
                {saving && (
                  <span className={`${styles.status} ${styles.actionsIn}`}>
                    <Spinner size={16} /> Guardando tu voto…
                  </span>
                )}
              </Stack>
            ) : (
              <span className={styles.status}>Revelado.</span>
            )}

            {iLeftApp && (
              <p className={styles.leftAppNotice} role="note">
                <Icon icon={AlertTriangle} size={16} /> Saliste de la app durante la jugada
              </p>
            )}

            {/* Pre-prompt de push (issue #769): SOLO cuentas y solo con viaje
                (el aviso es "reto nuevo en tu viaje"). Este reto no tiene hoy
                CTA de "guárdate" para el anónimo (a diferencia de
                PlayChallenge); el guard evita mostrárselo a quien aún no
                tiene identidad guardada. */}
            {!isAnonymous && groupId && (
              <PushOptInPrompt surface="post_play" groupId={groupId} className={styles.actionsIn} />
            )}

            {/* Marcador del reto: cada jugador con su número y su error relativo. */}
            {ranked.length > 0 && answer != null && (
              <div className={styles.board}>
                <span className={styles.boardTitle}>Marcador</span>
                <ul className={styles.boardList}>
                  {ranked.map((v, i) => {
                    const noGuess = v.guess_number == null
                    return (
                      <li
                        key={v.id}
                        className={`${styles.boardRow} ${i === 0 ? styles.boardRowTop : ''} ${
                          user && v.user_id === user.id ? styles.boardRowMe : ''
                        }`}
                      >
                        <span className={styles.rk}>{i + 1}</span>
                        <span className={styles.who}>
                          <Avatar
                            userId={v.user_id}
                            avatarUrl={v.avatar}
                            name={v.display_name}
                            size="sm"
                          />
                          <span className={styles.whoName}>{v.display_name}</span>
                          {v.left_app && (
                            <Icon
                              icon={AlertTriangle}
                              size={13}
                              className={styles.leftAppFlag}
                              aria-label="Salió de la app durante la jugada"
                            />
                          )}
                        </span>
                        <span className={styles.said}>
                          {noGuess
                            ? '— sin marcar'
                            : `${fmtNumber(v.guess_number as number, decimals, unit)} · ${signedRelErrorPct(
                                v.guess_number as number,
                                answer,
                              )}`}
                        </span>
                        <span className={styles.pt}>{v.points.toLocaleString('es-ES')}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Volver a jugar: SOLO en retos de práctica. */}
            {isPractice && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => void replay()}
                className={styles.actionsIn}
              >
                <span className={styles.inlineIcon}>
                  <Icon icon={RotateCcw} size={16} /> Volver a jugar
                </span>
              </Button>
            )}

            {groupId && (
              <Button
                variant="secondary"
                size="sm"
                className={styles.actionsIn}
                onClick={() => {
                  // Al Marcador (no al Diario): venimos de jugar, lo esperable es
                  // ver la clasificación (#509).
                  location.hash = marcadorGroupHash(groupId)
                }}
              >
                <span className={styles.inlineIcon}>
                  Ver clasificación <Icon icon={ArrowRight} size={16} />
                </span>
              </Button>
            )}
          </Stack>
        </Card>
      </Stack>
    </main>
  )
}
