import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayMap } from './PlayMap'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { sceneMedium } from './sceneMedium'
import { ResultCard } from './ResultCard'
import { RevealBurst } from './RevealBurst'
import { SceneImage } from './SceneImage'
import { buildChallengeLink, buildResultShareText } from './shareResult'
import {
  getAnswer,
  getChallenge,
  isPracticeChallenge,
  type ChallengeForPlay,
} from '../../lib/challenges'
import { deleteMyVote, getExistingVote, getVotes, submitVote } from '../../lib/votes'
import { getGroup } from '../../lib/groupData'
import { type Result } from '../../lib/result'
import { fmtDist, type LatLng } from '../../lib/geo'
import { track } from '../../lib/analytics'
import { describeError } from '../../lib/errors'
import { reportError } from '../../lib/observability'
import { useSession } from '../../lib/session-context'
import { useSignedImage } from '../../lib/useSignedImage'
// Rasterización + compartir reutilizadas de la tarjeta de clasificación (import
// READ-ONLY: no se edita ese módulo). Mismo estándar de snapshot y Web Share API.
import { nodeToPngBlob, shareDomain, shareLeaderboardImage } from '../group/shareLeaderboard'
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
// Umbral de "gran tiro": a partir del 75% de la puntuación máxima se dispara la
// celebración (titular cálido + confeti + háptico). Mismo corte que el anillo.
const GREAT_SHOT = MAX_POINTS * 0.75
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
// inmediato sin tocar el scoring (que ahora calcula el servidor en la RPC submit_vote).
function distanceLabel(km: number): string {
  if (km < 1) return '¡Clavado!'
  if (km < 25) return 'Muy cerca'
  if (km < 200) return 'Cerca'
  if (km < 1000) return 'Lejos'
  return 'Muy lejos'
}

export function PlayChallenge({ challengeId, groupId }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [challenge, setChallenge] = useState<ChallengeForPlay | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LatLng | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  // La respuesta (ubicación real) NO viaja en el payload del reto: llega del
  // servidor al votar (RPC) o se pide aparte al recargar un reto ya jugado/cerrado
  // (getAnswer, gobernado por RLS). Solo se conoce una vez revelado.
  const [answer, setAnswer] = useState<LatLng | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [saving, setSaving] = useState(false)
  // Posición del jugador en este reto (1 = mejor). Solo informativa: alimenta la
  // propiedad de analítica `rank_in_challenge` y el texto "Nº de N" del resultado.
  // Se calcula con los votos del reto tras revelar (no se conoce antes de votar).
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null)
  // Nombre del grupo para la tarjeta de "compartir mi resultado". El componente
  // solo recibe el código del grupo (groupId); el nombre lo leemos aparte. Null
  // hasta resolver (o si no hay grupo / falla): la tarjeta cae a "tu grupo".
  const [groupName, setGroupName] = useState<string | null>(null)
  // Compartir mi resultado: estado del PNG. `sharingResult` deshabilita el botón
  // mientras se rasteriza/comparte; el ref apunta a la tarjeta montada fuera del
  // viewport para el snapshot (mismo patrón que ShareLeaderboardModal).
  const [sharingResult, setSharingResult] = useState(false)
  const resultCardRef = useRef<HTMLDivElement>(null)
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

  // Revelar: emite el voto vía la RPC `submit_vote` (autoridad de servidor) y usa
  // SU resultado (distancia, puntos y la respuesta real) para revelar. El cliente ya
  // no calcula puntos ni conoce la respuesta de antemano. Sin pin (timeout) -> la RPC
  // guarda 0 puntos sin pin y NO devuelve respuesta -> "no diste a tiempo".
  const reveal = useCallback(
    async (current: ChallengeForPlay, playedGuess: LatLng | null) => {
      setPhase('revealed')
      setMapOpen(false)
      localStorage.removeItem(startKey(current.id))

      if (!user) {
        // La app está gateada por sesión; sin ella no se puede puntuar (la RPC exige
        // auth) ni conocer la respuesta. Caso límite: solo informamos.
        if (!playedGuess) setTimedOut(true)
        toast.show('No se guardó tu voto (sin sesión)', { tone: 'neutral' })
        return
      }

      setSaving(true)
      try {
        const res = await submitVote({
          challengeId: current.id,
          guessLat: playedGuess?.lat ?? null,
          guessLng: playedGuess?.lng ?? null,
        })
        if (!playedGuess) {
          // Voto de timeout: 0 puntos, sin pin. Queda MARCADO COMO JUGADO (no puede
          // reintentar para puntuar). La RPC no devuelve respuesta en este caso.
          setTimedOut(true)
          track('result_revealed', {
            group_id: current.group_id,
            challenge_id: current.id,
            timed_out: true,
            points: 0,
          })
          return
        }
        // El servidor devuelve distancia + puntos + la respuesta real para el pin.
        const km = res.distanceKm ?? 0
        setResult({ km, points: res.points })
        if (res.answerLat != null && res.answerLng != null) {
          setAnswer({ lat: res.answerLat, lng: res.answerLng })
        }
        // Posición en el reto: ranking estándar por puntos (1 + nº de votos con
        // MÁS puntos que el mío). Mi voto ya está persistido por submitVote, así
        // que getVotes lo incluye. Falla en silencio: el revelado no se bloquea
        // por esto y, sin rango, simplemente no añadimos la propiedad.
        let rankPosition: number | null = null
        let rankTotal: number | null = null
        try {
          const votes = await getVotes(current.id)
          if (votes.length > 0) {
            rankTotal = votes.length
            rankPosition = 1 + votes.filter((v) => v.points > res.points).length
            setRank({ position: rankPosition, total: rankTotal })
          }
        } catch {
          // Sin rango: el resultado se muestra igual; omitimos rank_in_challenge.
        }
        track('result_revealed', {
          group_id: current.group_id,
          challenge_id: current.id,
          timed_out: false,
          points: res.points,
          distance_km: km,
          // Solo si se pudo calcular (no rompemos el evento si falla la consulta).
          ...(rankPosition != null && { rank_in_challenge: rankPosition }),
        })
        toast.show('¡Voto guardado!', { tone: 'success' })
      } catch (err) {
        // Registramos el fallo en Sentry con contexto (el toast lo maneja para el
        // usuario, pero queremos verlo en el dashboard pase lo que pase).
        reportError(err, { area: 'submit_vote', challengeId: current.id })
        if (!playedGuess) {
          // El aviso de "no diste a tiempo" ya se muestra; no bloqueamos por esto.
          setTimedOut(true)
          return
        }
        // `describeError` evita el '[object Object]' de String(err) con errores
        // de Supabase/PostgREST (objeto, no Error nativo).
        toast.show(`No se pudo guardar: ${describeError(err)}`, {
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
            // Ya votó: tiene derecho a ver la respuesta. La pedimos aparte (no viaja
            // en el payload del reto); la RLS de challenge_answers la sirve por voto.
            const ans = await getAnswer(challengeId)
            if (cancelled) return
            if (ans) setAnswer(ans)
            // Posición en el reto para el texto "Nº de N" (recarga de un voto ya
            // emitido). Mismo ranking por puntos; falla en silencio.
            try {
              const votes = await getVotes(challengeId)
              if (!cancelled && votes.length > 0) {
                setRank({
                  position: 1 + votes.filter((v) => v.points > existing.points).length,
                  total: votes.length,
                })
              }
            } catch {
              // Sin rango: el resultado se muestra igual.
            }
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
        reportError(err, { area: 'load_challenge', challengeId })
        setLoadError(describeError(err))
        setPhase('loading')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [challengeId, user])

  // Nombre del grupo para la tarjeta de compartir. Solo si venimos de un grupo
  // (deep link con groupId). Falla en silencio: la tarjeta cae a "tu grupo".
  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    void getGroup(groupId)
      .then((g) => {
        if (!cancelled && g?.name) setGroupName(g.name)
      })
      .catch(() => {
        // Sin nombre: la tarjeta usa el fallback. No bloquea el juego.
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

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

  // Compartir MI resultado (apuesta viral): rasteriza la tarjeta (montada fuera
  // del viewport) y la comparte por Web Share API, con fallback a descarga +
  // caption al portapapeles. El caption y la tarjeta NO revelan la ubicación: solo
  // mi rendimiento. Requiere haber jugado (hay resultado, no timeout) y venir de un
  // grupo (para el enlace al reto). Dispara `result_shared` según cómo acabe.
  async function onShareResult() {
    if (!challenge || !result || !groupId) return
    const node = resultCardRef.current
    if (!node) return
    setSharingResult(true)
    try {
      const link = buildChallengeLink(groupId, challenge.id)
      const name = groupName ?? 'tu grupo'
      const text = buildResultShareText(name, link)
      const blob = await nodeToPngBlob(node)
      const outcome = await shareLeaderboardImage(blob, text, `Mi resultado · ${challenge.title}`)
      if (outcome === 'cancelled') return
      track('result_shared', {
        surface: outcome,
        group_id: groupId,
        challenge_id: challenge.id,
        points: result.points,
        distance_km: result.km,
      })
      toast.show(
        outcome === 'downloaded'
          ? 'Imagen descargada y enlace copiado, pégalos en el chat'
          : '¡Compartido!',
        { tone: 'success' },
      )
    } catch {
      toast.show('No se pudo generar la imagen', { tone: 'danger' })
    } finally {
      setSharingResult(false)
    }
  }

  // Volver a jugar (SOLO en retos de práctica): borra el voto propio y reinicia
  // el estado local para empezar de cero. Sin esto no se podría retrastear un reto
  // sin SQL. El gating de práctica vive en el render (no se monta el botón en retos
  // reales), pero el borrado en sí lo respalda la RLS `votes_delete_self`.
  async function replay() {
    if (!challenge) return
    try {
      await deleteMyVote(challenge.id)
      // Reinicio limpio: replicamos el estado inicial de "aún no ha votado". El
      // start_at persistido se borra para que el reloj se reconstruya desde cero
      // al volver a Empezar (no regalar ni recortar tiempo de la jugada anterior).
      localStorage.removeItem(startKey(challenge.id))
      setGuess(null)
      setResult(null)
      setAnswer(null)
      setRemaining(null)
      setTimedOut(false)
      setRank(null)
      setMapOpen(false)
      setShowStreetView(false)
      setSaving(false)
      setSharingResult(false)
      setPhase('idle')
      track('challenge_replayed', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
      })
    } catch (err) {
      reportError(err, { area: 'replay_challenge', challengeId: challenge.id })
      toast.show(`No se pudo reiniciar: ${describeError(err)}`, { tone: 'danger' })
    }
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
  // Posición de fallback para el panorama: solo se usaría si NO hubiera panoId, pero
  // `hasStreetView` implica sv_pano_id != null, así que el panorama siempre usa el
  // panoId y nunca esta posición. La respuesta real (`answer`) solo se conoce tras
  // revelar; al jugar es null y NO debe alimentar la escena.
  const panoFallback: LatLng = answer ?? { lat: 0, lng: 0 }
  const urgent = remaining != null && remaining <= 10
  const backLabel = groupId ? 'Volver al grupo' : 'Inicio'
  // Reto de práctica: plazo lejano (>1 año). Solo en estos mostramos "volver a
  // jugar" tras revelar; en un reto real rejugar tras ver la respuesta sería trampa.
  const isPractice = isPracticeChallenge(challenge.deadline_at)

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
              position={panoFallback}
              heading={challenge.sv_heading}
              pitch={challenge.sv_pitch}
            />
          ) : imageUrl ? (
            // Foto-escena (reto legacy): con esqueleto mientras carga del Storage
            // firmado, para que el hueco no parezca roto.
            <SceneImage
              key={imageUrl}
              src={imageUrl}
              alt={challenge.title}
              className={styles.photoFull}
              skeletonRadius="sm"
            />
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

        {/* Foto-pista flotante (si el reto la marcó como pista). Con esqueleto
            mientras carga para que el recuadro no aparezca vacío/roto. */}
        {hintPhotoUrl && (
          <div className={styles.hintFloat}>
            <SceneImage
              key={hintPhotoUrl}
              src={hintPhotoUrl}
              alt="Pista: foto del reto"
              className={styles.hintImg}
              skeletonRadius="md"
            />
          </div>
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
                {/* Celebración de gran tiro: destello + confeti sobrio + háptico.
                    Solo se monta si fue gran tiro; respeta reduced-motion (no pinta
                    ni vibra). Va absoluto sobre el bloque, sin capturar toques. */}
                <RevealBurst active={result.points >= GREAT_SHOT} />
                {/* Titular de celebración: cálido y enérgico si fue gran tiro. */}
                <span
                  className={`${styles.scoreEyebrow} ${
                    result.points >= GREAT_SHOT ? styles.scoreEyebrowWin : ''
                  }`}
                >
                  {result.points >= GREAT_SHOT ? '🎉 ¡Gran tiro!' : 'Resultado'}
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
                  {/* Tu puesto en el reto: pica a mejorar ("3º de 6"). Solo si se
                      pudo calcular con los votos del reto. */}
                  {rank && (
                    <span className={styles.rank}>
                      {rank.position}º de {rank.total}
                    </span>
                  )}
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

            {/* Compartir MI resultado (apuesta viral): pica al resto a jugar con la
                tarjeta de mi rendimiento, SIN revelar la ubicación. Solo si jugué
                (hay resultado, no timeout) y vengo de un grupo (para el enlace al
                reto). No se muestra en timeout: no hay puntos que presumir. */}
            {result && groupId && (
              <Button
                fullWidth
                size="lg"
                onClick={() => void onShareResult()}
                loading={sharingResult}
              >
                📤 Compartir mi resultado
              </Button>
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
                        position={panoFallback}
                        heading={challenge.sv_heading}
                        pitch={challenge.sv_pitch}
                      />
                    ) : imageUrl ? (
                      <SceneImage
                        key={imageUrl}
                        src={imageUrl}
                        alt={challenge.title}
                        className={styles.photo}
                        skeletonRadius="lg"
                      />
                    ) : null}
                  </div>
                )}
              </Stack>
            )}

            {/* Volver a jugar: SOLO en retos de práctica (plazo lejano). Reinicia
                el juego para retrastear sin SQL; en retos reales NO se monta (rejugar
                tras ver la respuesta sería trampa). */}
            {isPractice && (
              <Button variant="secondary" fullWidth onClick={() => void replay()}>
                🔄 Volver a jugar
              </Button>
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

      {/* Lienzo de captura: la tarjeta de MI resultado vive a tamaño real (1080px)
          fuera del viewport para que html-to-image la mida y rasterice bien
          (display:none mediría 0×0). Solo cuando hay un resultado real que
          compartir. NO-SPOILER: ResultCard solo recibe rendimiento (puntos,
          distancia) + título y grupo; nunca la ubicación, mapa ni foto del reto.
          aria-hidden: es un lienzo, no contenido. */}
      {result && groupId && (
        <div className={styles.shareCanvas} aria-hidden="true">
          <ResultCard
            ref={resultCardRef}
            groupName={groupName ?? 'tu grupo'}
            challengeTitle={challenge.title}
            points={result.points}
            distanceKm={result.km}
            domain={shareDomain(buildChallengeLink(groupId, challenge.id))}
          />
        </div>
      )}
    </main>
  )
}
