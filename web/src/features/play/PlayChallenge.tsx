import { useCallback, useEffect, useState } from 'react'
import { PlayMap } from './PlayMap'
import { getChallenge } from '../../lib/challenges'
import { getExistingVote, saveVote } from '../../lib/votes'
import { computeResult, type Result } from '../../lib/result'
import { fmtDist, type LatLng } from '../../lib/geo'
import { getName, setName } from '../../lib/identity'
import { supabase } from '../../lib/supabase'
import type { Challenge } from '../../lib/database.types'
import { Badge, Button, Card, Modal, Row, Spinner, Stack, useToast } from '../../ui'
import styles from './PlayChallenge.module.css'

interface Props {
  challengeId: string
  groupId?: string
}

// Fases del juego. El overlay "Empezar" tapa todo en `idle`; el reloj solo
// corre en `playing`; tras `revealed` el voto queda fijo.
type Phase = 'loading' | 'idle' | 'playing' | 'revealed'

// `start_at` por reto en localStorage: recargar durante la jugada no regala
// tiempo (el reloj se reconstruye desde el instante en que se pulsó Empezar).
const startKey = (challengeId: string) => `lg.play.startAt.${challengeId}`

function publicImageUrl(imagePath: string): string {
  return supabase.storage.from('images').getPublicUrl(imagePath).data.publicUrl
}

export function PlayChallenge({ challengeId, groupId }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LatLng | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  // Revelar: calcula resultado contra la respuesta real, fija el pin y, si hay
  // pin, persiste el voto. Sin pin (timeout) -> "no diste a tiempo".
  const reveal = useCallback(
    async (current: Challenge, playedGuess: LatLng | null) => {
      setPhase('revealed')
      localStorage.removeItem(startKey(current.id))
      if (!playedGuess) {
        setTimedOut(true)
        return
      }
      const answer = { lat: current.lat, lng: current.lng }
      const r = computeResult(playedGuess, answer)
      setResult(r)

      let name = getName()
      if (!name) {
        name = window.prompt('¿Tu nombre? (para guardar tu jugada)')?.trim() ?? ''
        if (!name) {
          toast.show('No se guardó tu voto (sin nombre)', { tone: 'neutral' })
          return
        }
        setName(name)
      }
      setSaving(true)
      try {
        await saveVote({
          groupId: current.group_id,
          challengeId: current.id,
          playerName: name,
          guessLat: playedGuess.lat,
          guessLng: playedGuess.lng,
          distanceKm: r.km,
          points: r.points,
        })
        toast.show('¡Voto guardado!', { tone: 'success' })
      } catch (err) {
        toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
          tone: 'danger',
        })
      } finally {
        setSaving(false)
      }
    },
    [toast],
  )

  // Carga del reto. Si el jugador ya votó, salta directo a revelado mostrando
  // su jugada (no se re-vota: regla anti-trampas + upsert por nombre).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = await getChallenge(challengeId)
        if (cancelled) return
        setChallenge(c)

        const name = getName()
        const existing = name ? await getExistingVote(challengeId, name) : null
        if (cancelled) return
        if (existing) {
          setGuess({ lat: existing.guess_lat, lng: existing.guess_lng })
          setResult({ km: existing.distance_km, points: existing.points })
          setPhase('revealed')
          return
        }
        // Si se recargó a media jugada (hay `start_at`), retomamos el juego sin
        // volver a mostrar el overlay "Empezar" (el reloj no se reinicia).
        const resuming = c.guess_seconds != null && localStorage.getItem(startKey(c.id)) != null
        setPhase(resuming ? 'playing' : 'idle')
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setPhase('loading')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  // Cuenta atrás. Arranca al entrar en `playing` reconstruyendo desde `start_at`
  // (persistido), así una recarga no reinicia el reloj. Al llegar a 0 → revelar.
  useEffect(() => {
    if (phase !== 'playing' || !challenge || challenge.guess_seconds == null) return
    const total = challenge.guess_seconds
    const startAt = Number(localStorage.getItem(startKey(challenge.id)) ?? Date.now())

    const tick = () => {
      const left = Math.max(0, total - Math.floor((Date.now() - startAt) / 1000))
      setRemaining(left)
      if (left <= 0) {
        void reveal(challenge, guess)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, challenge, guess, reveal])

  function start() {
    if (!challenge) return
    if (challenge.guess_seconds != null) {
      localStorage.setItem(startKey(challenge.id), String(Date.now()))
    }
    setPhase('playing')
  }

  function confirm() {
    if (challenge && guess) void reveal(challenge, guess)
  }

  if (loadError) {
    return (
      <main className="lg-page">
        <Card padding="md">
          <Stack gap={2}>
            <strong>No se pudo cargar el reto.</strong>
            <span className={styles.status}>{loadError}</span>
          </Stack>
        </Card>
      </main>
    )
  }

  if (phase === 'loading' || !challenge) {
    return (
      <main className="lg-page">
        <div className={styles.centered}>
          <Spinner size={32} />
        </div>
      </main>
    )
  }

  const imageUrl = challenge.image_path ? publicImageUrl(challenge.image_path) : null
  const revealed = phase === 'revealed'
  const answer: LatLng | null = revealed ? { lat: challenge.lat, lng: challenge.lng } : null
  const urgent = remaining != null && remaining <= 10

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Stack gap={2} className={styles.header}>
          <Row gap={3} justify="between">
            <h1 className={styles.title}>{challenge.title}</h1>
            {phase === 'playing' && remaining != null && (
              <Badge tone={urgent ? 'danger' : 'neutral'}>
                <span className={`${styles.timer} ${urgent ? styles.timerUrgent : ''}`}>
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </span>
              </Badge>
            )}
          </Row>
        </Stack>

        {imageUrl && <img className={styles.photo} src={imageUrl} alt={challenge.title} />}

        <PlayMap guess={guess} answer={answer} locked={revealed} onPick={setGuess} />

        {!revealed && (
          <>
            {guess ? (
              <Row gap={2}>
                <Badge tone="accent">📍 Tu pin</Badge>
                <span className={styles.coords}>
                  {guess.lat.toFixed(5)}, {guess.lng.toFixed(5)}
                </span>
              </Row>
            ) : (
              <p className={styles.status}>Toca el mapa para colocar tu pin.</p>
            )}
            <Button size="lg" fullWidth disabled={!guess} onClick={confirm}>
              Confirmar y revelar
            </Button>
          </>
        )}

        {revealed && (
          <Card padding="md" raised>
            {timedOut ? (
              <Stack gap={2}>
                <strong>⏰ No diste a tiempo</strong>
                <span className={styles.status}>Se acabó el tiempo antes de colocar tu pin.</span>
              </Stack>
            ) : result ? (
              <Stack gap={3}>
                <Row gap={3} align="baseline">
                  <span className={styles.points}>{result.points}</span>
                  <span className={styles.resultDist}>puntos · {fmtDist(result.km)}</span>
                </Row>
                {saving && (
                  <Row gap={2}>
                    <Spinner size={16} />
                    <span className={styles.status}>Guardando tu voto…</span>
                  </Row>
                )}
              </Stack>
            ) : (
              <span className={styles.status}>Revelado.</span>
            )}
            {groupId && (
              <Row gap={2} justify="end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    location.hash = `#g=${groupId}`
                  }}
                >
                  Ver clasificación →
                </Button>
              </Row>
            )}
          </Card>
        )}
      </Stack>

      <Modal
        open={phase === 'idle'}
        title="¿Listo para jugar?"
        footer={
          <Button size="lg" fullWidth onClick={start}>
            Empezar
          </Button>
        }
      >
        <div className={styles.startBody}>
          <Stack gap={3} align="center">
            <span aria-hidden="true" style={{ fontSize: '2.5rem' }}>
              🌍
            </span>
            <p>
              Cuando pulses <strong>Empezar</strong>, verás la foto y el mapa.
            </p>
            {challenge.guess_seconds != null ? (
              <p className={styles.status}>
                Tendrás {challenge.guess_seconds} segundos para colocar tu pin.
              </p>
            ) : (
              <p className={styles.status}>Sin límite de tiempo. Tómate lo que necesites.</p>
            )}
          </Stack>
        </div>
      </Modal>
    </main>
  )
}
