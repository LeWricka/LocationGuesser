import { useCallback, useEffect, useState } from 'react'
import { PlayMap } from './PlayMap'
import { StreetViewPano } from './StreetViewPano'
import { sceneMedium } from './sceneMedium'
import { getChallenge } from '../../lib/challenges'
import { getExistingVote, saveVote } from '../../lib/votes'
import { computeResult, type Result } from '../../lib/result'
import { fmtDist, type LatLng } from '../../lib/geo'
import { getIdentity } from '../../lib/identity'
import { useIdentity } from '../identity'
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

// Etiqueta cualitativa según la distancia del acierto. Da feedback emocional
// inmediato sin tocar el scoring (que sigue siendo `computeResult`).
function distanceLabel(km: number): string {
  if (km < 1) return '¡Clavado!'
  if (km < 25) return 'Muy cerca'
  if (km < 200) return 'Cerca'
  if (km < 1000) return 'Lejos'
  return 'Muy lejos'
}

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
  // Mapa de adivinar como panel expandible estilo GeoGuessr: mini en la esquina,
  // se abre a grande para colocar el pin con precisión.
  const [mapOpen, setMapOpen] = useState(false)
  // Tras revelar el Street View es secundario: oculto hasta que se pide verlo.
  const [showStreetView, setShowStreetView] = useState(false)
  const toast = useToast()
  const { ensureIdentity, modal: identityModal } = useIdentity()

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

      // El nombre ya se pidió al entrar; aquí solo lo usamos (fallback por si acaso).
      const name = getIdentity()?.name ?? (await ensureIdentity(current.group_id))
      if (!name) {
        toast.show('No se guardó tu voto (sin nombre)', { tone: 'neutral' })
        return
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
    [toast, ensureIdentity],
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

        // Pedimos el nombre lo PRIMERO (antes de jugar) si el navegador aún no
        // tiene identidad. Así "¿quién juega?" va antes de responder.
        let name = getIdentity()?.name ?? null
        if (!name) {
          name = await ensureIdentity(c.group_id)
          if (cancelled) return
        }
        // ¿Ya votó este jugador? → directo a su resultado (no se re-vota, ni
        // aunque el reto siga en vivo).
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
  }, [challengeId, ensureIdentity])

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
        {/* Imprescindible: en incógnito se pide el nombre durante la carga; si
            no montamos el modal aquí, se quedaría cargando para siempre. */}
        {identityModal}
      </main>
    )
  }

  // Retos nuevos traen Street View; los legacy solo tienen foto. El render
  // decide: si hay panorama → panorama interactivo; si no, foto (modo legacy,
  // retos antiguos no se rompen).
  const medium = sceneMedium(challenge)
  const hasStreetView = medium === 'streetview'
  const imageUrl =
    medium === 'photo' && challenge.image_path ? publicImageUrl(challenge.image_path) : null
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

        {!revealed ? (
          /* Fase de jugar: escena protagonista (panorama o foto) con el mapa de
             adivinar superpuesto estilo GeoGuessr. */
          <div className={styles.scene}>
            {hasStreetView ? (
              <StreetViewPano
                panoId={challenge.sv_pano_id}
                position={{ lat: challenge.lat, lng: challenge.lng }}
                heading={challenge.sv_heading}
                pitch={challenge.sv_pitch}
              />
            ) : imageUrl ? (
              <img className={styles.photo} src={imageUrl} alt={challenge.title} />
            ) : (
              <p className={styles.status}>Este reto no tiene imagen ni Street View.</p>
            )}

            {/* Mini-mapa en la esquina que se expande para afinar el pin. En
                desktop se abre al pasar el ratón; en móvil con el botón. */}
            <div
              className={`${styles.mapPanel} ${mapOpen ? styles.mapPanelOpen : ''}`}
              onMouseEnter={() => setMapOpen(true)}
            >
              <button
                type="button"
                className={styles.mapToggle}
                aria-expanded={mapOpen}
                onClick={() => setMapOpen((v) => !v)}
              >
                {mapOpen ? '✕' : '🗺️ Adivinar'}
              </button>
              <div className={styles.mapInner}>
                <PlayMap guess={guess} answer={null} locked={false} onPick={setGuess} />
              </div>
            </div>
          </div>
        ) : (
          /* Fase revelada: el mapa pasa a protagonista, a tamaño grande, con tu
             pin + 🎯 real + línea, encuadrado a los dos puntos. */
          <div className={styles.resultMap}>
            <PlayMap guess={guess} answer={answer} locked onPick={setGuess} />
          </div>
        )}

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
              <p className={styles.status}>Abre el mapa y toca para colocar tu pin.</p>
            )}
            <Button size="lg" fullWidth disabled={!guess} onClick={confirm}>
              Confirmar y revelar
            </Button>
          </>
        )}

        {revealed && (
          <Card padding="md" raised>
            <Stack gap={4}>
              {timedOut ? (
                <Stack gap={2}>
                  <strong>⏰ No diste a tiempo</strong>
                  <span className={styles.status}>Se acabó el tiempo antes de colocar tu pin.</span>
                </Stack>
              ) : result ? (
                <Stack gap={3}>
                  <Stack gap={1} align="center" className={styles.scoreboard}>
                    <span className={styles.scoreLabel}>{distanceLabel(result.km)}</span>
                    <span className={styles.points}>{result.points}</span>
                    <span className={styles.resultDist}>
                      puntos · a {fmtDist(result.km)} del objetivo
                    </span>
                  </Stack>
                  {saving && (
                    <Row gap={2} justify="center">
                      <Spinner size={16} />
                      <span className={styles.status}>Guardando tu voto…</span>
                    </Row>
                  )}
                </Stack>
              ) : (
                <span className={styles.status}>Revelado.</span>
              )}

              {/* Street View secundario: oculto tras un botón. Solo si el reto lo
                tiene; los legacy con foto la muestran directa, también plegada. */}
              {(hasStreetView || imageUrl) && (
                <Stack gap={2} className={styles.secondary}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowStreetView((v) => !v)}
                    aria-expanded={showStreetView}
                  >
                    {showStreetView
                      ? '✕ Ocultar'
                      : hasStreetView
                        ? '👀 Ver Street View'
                        : '👀 Ver la foto'}
                  </Button>
                  {showStreetView && (
                    <div className={styles.scene}>
                      {hasStreetView ? (
                        <StreetViewPano
                          panoId={challenge.sv_pano_id}
                          position={{ lat: challenge.lat, lng: challenge.lng }}
                          heading={challenge.sv_heading}
                          pitch={challenge.sv_pitch}
                        />
                      ) : imageUrl ? (
                        <img className={styles.photo} src={imageUrl} alt={challenge.title} />
                      ) : null}
                    </div>
                  )}
                </Stack>
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
            </Stack>
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
              Cuando pulses <strong>Empezar</strong>, podrás{' '}
              {hasStreetView ? 'explorar el panorama' : 'ver la foto'} y adivinar en el mapa.
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

      {identityModal}
    </main>
  )
}
