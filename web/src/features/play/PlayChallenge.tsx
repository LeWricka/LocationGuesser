import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayMap } from './PlayMap'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { sceneMedium } from './sceneMedium'
import { getChallenge } from '../../lib/challenges'
import { getExistingVote, saveVote } from '../../lib/votes'
import { computeResult, type Result } from '../../lib/result'
import { fmtDist, type LatLng } from '../../lib/geo'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { useSignedImage } from '../../lib/useSignedImage'
import type { Challenge } from '../../lib/database.types'
import {
  Badge,
  BackHomeButton,
  Button,
  Card,
  ChallengePhoto,
  CountdownRing,
  CountUp,
  Modal,
  Row,
  ScoreRing,
  Skeleton,
  Spinner,
  Stack,
  useToast,
} from '../../ui'

// Puntuación máxima del scoring `5000·e^(−km/2000)`: base del % del anillo de
// resultado. No cambia el scoring (vive en lib/result); solo lo visualiza.
const MAX_POINTS = 5000
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

export function PlayChallenge({ challengeId, groupId }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LatLng | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [saving, setSaving] = useState(false)
  // Mapa de adivinar como hoja inferior (bottom sheet) estilo GeoGuessr: el FAB
  // 🗺️ la sube; dentro se coloca el pin y se confirma; cerrar vuelve al panorama.
  const [mapOpen, setMapOpen] = useState(false)
  // Orientación actual del panorama (0=N). La provee el panorama vía callback y
  // alimenta la brújula. Sin esto la aguja no seguiría el giro.
  // Tras revelar el Street View es secundario: oculto hasta que se pide verlo.
  const [showStreetView, setShowStreetView] = useState(false)
  const toast = useToast()
  // Handle imperativo del panorama para los controles "volver al inicio" / "norte".
  const panoRef = useRef<StreetViewPanoHandle>(null)
  // La identidad es la sesión: el voto se atribuye a `user.id` (no a un nombre).
  const { user } = useSession()
  // URL firmada de la foto del reto (bucket privado). Hook al tope del componente
  // —no tras los early-return de carga— para no romper el orden de hooks.
  const photoUrl = useSignedImage(challenge?.image_path ?? null)

  // Revelar: calcula resultado contra la respuesta real, fija el pin y, si hay
  // pin, persiste el voto. Sin pin (timeout) -> "no diste a tiempo".
  const reveal = useCallback(
    async (current: Challenge, playedGuess: LatLng | null) => {
      setPhase('revealed')
      setMapOpen(false)
      localStorage.removeItem(startKey(current.id))
      if (!playedGuess) {
        // Se acabó el tiempo sin marcar → 0 puntos y queda MARCADO COMO JUGADO
        // (un voto de timeout: sin pin). Así no puede reintentar para puntuar.
        setTimedOut(true)
        track('result_revealed', {
          group_id: current.group_id,
          challenge_id: current.id,
          timed_out: true,
          points: 0,
        })
        if (user) {
          setSaving(true)
          try {
            await saveVote({
              groupId: current.group_id,
              challengeId: current.id,
              userId: user.id,
              guessLat: null,
              guessLng: null,
              distanceKm: null,
              points: 0,
            })
          } catch {
            // El aviso de "no diste a tiempo" ya se muestra; no bloqueamos por esto.
          } finally {
            setSaving(false)
          }
        }
        return
      }
      const answer = { lat: current.lat, lng: current.lng }
      const r = computeResult(playedGuess, answer)
      setResult(r)
      track('result_revealed', {
        group_id: current.group_id,
        challenge_id: current.id,
        timed_out: false,
        points: r.points,
        distance_km: r.km,
      })

      if (!user) {
        toast.show('No se guardó tu voto (sin sesión)', { tone: 'neutral' })
        return
      }
      setSaving(true)
      try {
        await saveVote({
          groupId: current.group_id,
          challengeId: current.id,
          userId: user.id,
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
    [toast, user],
  )

  // Carga del reto. Si el usuario ya votó, salta directo a revelado mostrando
  // su jugada (no se re-vota: regla anti-trampas + upsert por user_id).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = await getChallenge(challengeId)
        if (cancelled) return
        setChallenge(c)

        // ¿Ya votó este usuario? → directo a su resultado (no se re-vota, ni
        // aunque el reto siga en vivo). La identidad es la sesión.
        const existing = user ? await getExistingVote(challengeId, user.id) : null
        if (cancelled) return
        if (existing) {
          if (existing.guess_lat == null || existing.guess_lng == null) {
            // Voto de timeout: jugó pero no marcó → 0 pts, sin pin. Marcado como
            // jugado (no puede reintentar), se muestra "no diste a tiempo".
            setTimedOut(true)
          } else {
            setGuess({ lat: existing.guess_lat, lng: existing.guess_lng })
            setResult({ km: existing.distance_km ?? 0, points: existing.points })
          }
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
  }, [challengeId, user])

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
    if (challenge && guess) {
      // Adivinanza enviada (con pin). El timeout sin marcar NO es "jugar": no
      // hubo adivinanza, se contabiliza solo como result_revealed (timed_out).
      track('challenge_played', { group_id: challenge.group_id, challenge_id: challenge.id })
      void reveal(challenge, guess)
    }
  }

  // Salida siempre disponible: nunca dejar al jugador atrapado en el reto. Si
  // venimos de un grupo (deep link `#g=…&c=…`) volvemos a su clasificación; si
  // no, a la home (hash vacío). El `start_at` persistido deja el reloj intacto
  // si se vuelve a entrar a media jugada.
  function goBack() {
    location.hash = groupId ? `#g=${groupId}` : ''
  }

  if (loadError) {
    return (
      <main className="lg-page">
        <Stack gap={4}>
          <BackHomeButton onClick={goBack} label={groupId ? 'Volver al grupo' : 'Inicio'} />
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

  if (phase === 'loading' || !challenge) {
    return (
      <main className="lg-page" role="status" aria-label="Cargando el reto">
        {/* Esqueleto con la silueta del reto (título + escena + CTA): la espera
            se percibe más corta que con un spinner suelto. */}
        <Stack gap={4}>
          <Skeleton width="55%" height={28} radius="md" />
          <Skeleton width="100%" height="46svh" radius="lg" />
          <Skeleton width="100%" height={52} radius="sm" />
        </Stack>
      </main>
    )
  }

  // Retos nuevos traen Street View; los legacy solo tienen foto. El render
  // decide: si hay panorama → panorama interactivo; si no, foto (modo legacy,
  // retos antiguos no se rompen).
  const medium = sceneMedium(challenge)
  const hasStreetView = medium === 'streetview'
  // Escena legacy: el reto es solo foto (sin SV). Entonces la foto ES la escena.
  const imageUrl = !hasStreetView ? photoUrl : null
  const revealed = phase === 'revealed'
  // La foto opcional de un reto de SV: si es pista, se ve al jugar junto al
  // panorama; si es sorpresa, se reserva para el revelado.
  const hintPhotoUrl = hasStreetView && photoUrl && challenge.photo_is_hint ? photoUrl : null
  const surprisePhotoUrl = hasStreetView && photoUrl && !challenge.photo_is_hint ? photoUrl : null
  const answer: LatLng | null = revealed ? { lat: challenge.lat, lng: challenge.lng } : null
  const urgent = remaining != null && remaining <= 10
  const backLabel = groupId ? 'Volver al grupo' : 'Inicio'

  // --------------------------------------------------------------------------
  // Fase de JUGAR: experiencia inmersiva a pantalla completa estilo GeoGuessr.
  // Sale del wrapper `lg-page`: contenedor fijo cubriendo el viewport, escena
  // edge-to-edge y controles flotando por encima (brújula+timer, FAB del mapa,
  // controles del panorama, hoja inferior con el mapa de adivinar). Se monta en
  // `playing` e `idle` (el overlay "Empezar" tapa la escena ya cargada detrás).
  // --------------------------------------------------------------------------
  if (!revealed) {
    return (
      <div className={styles.immersive}>
        {/* Escena protagonista: panorama interactivo o foto (legacy). */}
        <div className={styles.sceneFull}>
          {hasStreetView ? (
            <StreetViewPano
              ref={panoRef}
              panoId={challenge.sv_pano_id}
              position={{ lat: challenge.lat, lng: challenge.lng }}
              heading={challenge.sv_heading}
              pitch={challenge.sv_pitch}
            />
          ) : imageUrl ? (
            <img className={styles.photoFull} src={imageUrl} alt={challenge.title} />
          ) : (
            <div className={styles.noScene}>
              <p className={styles.status}>Este reto no tiene imagen ni Street View.</p>
            </div>
          )}
        </div>

        {/* Clúster arriba-izquierda: salida + brújula + temporizador, flotando
            sobre la escena (respeta el notch con safe-area). */}
        <div className={styles.topCluster}>
          <BackHomeButton onClick={goBack} label={backLabel} />
          {phase === 'playing' && remaining != null && challenge.guess_seconds != null && (
            <CountdownRing remaining={remaining} total={challenge.guess_seconds} urgent={urgent} />
          )}
        </div>

        {/* Foto-pista flotante (si el reto la marcó como pista). */}
        {hintPhotoUrl && (
          <img className={styles.hintFloat} src={hintPhotoUrl} alt="Pista: foto del reto" />
        )}

        {/* Abajo-izquierda: controles del panorama (solo con Street View). */}
        {hasStreetView && (
          <div className={styles.panoControls}>
            <button
              type="button"
              className={styles.glassBtn}
              onClick={() => panoRef.current?.resetToStart()}
              aria-label="Volver a la posición inicial"
              title="Volver a la posición inicial"
            >
              ⌂
            </button>
            <button
              type="button"
              className={styles.glassBtn}
              onClick={() => panoRef.current?.resetPov()}
              aria-label="Enderezar la vista al norte"
              title="Enderezar (norte)"
            >
              🧭
            </button>
          </div>
        )}

        {/* Abajo-derecha: FAB del mapa. Abre la hoja inferior para adivinar. */}
        <button
          type="button"
          className={styles.mapFab}
          onClick={() => setMapOpen(true)}
          aria-label="Abrir el mapa para adivinar"
        >
          <span aria-hidden="true">🗺️</span>
          {guess && <span className={styles.fabDot} aria-hidden="true" />}
        </button>

        {/* Hoja inferior con el mapa de adivinar. El mapa se mantiene SIEMPRE
            montado (solo se traslada fuera de pantalla al cerrar) para conservar
            el zoom y la posición entre aperturas: si no, al volver a abrir
            perdías el encuadre y empezabas de cero. Su contenedor tiene tamaño
            completo aunque esté trasladado, así que carga sin gris (ResizeObserver
            de PlayMap). */}
        <div
          className={`${styles.sheetScrim} ${mapOpen ? styles.sheetScrimOpen : ''}`}
          onClick={() => setMapOpen(false)}
          aria-hidden={!mapOpen}
        />
        <section
          className={`${styles.sheet} ${mapOpen ? styles.sheetOpen : ''}`}
          role="dialog"
          aria-label="Mapa para adivinar"
          aria-hidden={!mapOpen}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          <button
            type="button"
            className={styles.sheetClose}
            onClick={() => setMapOpen(false)}
            aria-label="Cerrar el mapa"
          >
            ✕
          </button>
          <div className={styles.sheetMap}>
            <PlayMap guess={guess} answer={null} locked={false} onPick={setGuess} />
          </div>
          <div className={styles.sheetFooter}>
            {guess ? (
              <Row gap={2} align="center">
                <Badge tone="accent">📍 Tu pin</Badge>
                <span className={styles.coords}>
                  {guess.lat.toFixed(4)}, {guess.lng.toFixed(4)}
                </span>
              </Row>
            ) : (
              <span className={styles.status}>Toca el mapa para colocar tu pin.</span>
            )}
            <Button size="lg" fullWidth disabled={!guess} onClick={confirm}>
              ✓ Confirmar y revelar
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setMapOpen(false)}>
              ← Volver a {hasStreetView ? 'Street View' : 'la imagen'}
            </Button>
          </div>
        </section>

        {/* Overlay "Empezar": tapa la escena ya cargada detrás. Descartable
            (✕/Escape/fuera) para no quedar atrapado. */}
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
          <div className={styles.startBody}>
            <Stack gap={3} align="center">
              <span aria-hidden="true" style={{ fontSize: '2.5rem' }}>
                🌍
              </span>
              <p>
                Cuando pulses <strong>Empezar</strong>, podrás{' '}
                {hasStreetView ? 'explorar el panorama' : 'ver la foto'} y abrir el mapa para
                adivinar.
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
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Fase REVELADA: el mapa pasa a protagonista (tu pin + 🎯 + línea, encuadrado),
  // con el anillo de puntuación y la foto sorpresa. Vuelve al layout de página.
  // --------------------------------------------------------------------------
  return (
    <main className="lg-page">
      <Stack gap={4}>
        <BackHomeButton onClick={goBack} label={backLabel} />
        <Stack gap={2} className={styles.header}>
          <h1 className={styles.title}>{challenge.title}</h1>
        </Stack>

        <div className={`${styles.resultMap} lg-rise`}>
          <PlayMap guess={guess} answer={answer} locked onPick={setGuess} />
        </div>

        <Card padding="md" raised>
          <Stack gap={4}>
            {timedOut ? (
              <Stack gap={2}>
                <strong>⏰ No diste a tiempo</strong>
                <span className={styles.status}>Se acabó el tiempo antes de colocar tu pin.</span>
              </Stack>
            ) : result ? (
              <Stack gap={4} align="center" className={styles.scoreReveal}>
                {/* Titular de celebración: cálido y enérgico si fue gran tiro. */}
                <span
                  className={`${styles.scoreEyebrow} ${
                    result.points >= MAX_POINTS * 0.75 ? styles.scoreEyebrowWin : ''
                  }`}
                >
                  {result.points >= MAX_POINTS * 0.75 ? '🎉 ¡Gran tiro!' : 'Resultado'}
                </span>
                {/* Anillo de acierto protagonista: % de la puntuación máxima, con
                    los puntos (count-up) gigantes en el centro. */}
                <ScoreRing value={result.points} max={MAX_POINTS} size={168}>
                  <CountUp className={styles.ringPoints} value={result.points} duration={1200} />
                  <span className={styles.ringUnit}>puntos</span>
                </ScoreRing>
                <div className={styles.scoreText}>
                  <span className={styles.scoreLabel}>{distanceLabel(result.km)}</span>
                  <span className={styles.resultDist}>
                    a <strong className={styles.resultKm}>{fmtDist(result.km)}</strong> del objetivo
                  </span>
                </div>
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

            {/* Foto sorpresa: estaba oculta al jugar; se revela aquí, al votar. */}
            {surprisePhotoUrl && (
              <ChallengePhoto
                src={surprisePhotoUrl}
                alt="Foto del reto"
                caption="La foto del reto"
              />
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
                  <div className={styles.secondaryScene}>
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
      </Stack>
    </main>
  )
}
