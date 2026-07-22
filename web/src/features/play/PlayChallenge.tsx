import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Ghost,
  Lock,
  RotateCcw,
  Share2,
  Timer,
  TimerOff,
} from 'lucide-react'
import { PlayMap } from './PlayMap'
// Mapa de RESULTADO (issue #795): pines de TODOS los que ya jugaron, con su
// nombre — no solo el propio + la respuesta. Reutiliza la fábrica de pines
// (issue #794) y el criterio de labels ya resueltos en `AllGuessesMap`.
import { AllGuessesMap, type GuessMarker } from '../group/AllGuessesMap'
// Leyenda del resultado (issue #811): mismo componente/estilos que el detalle
// de un reto en el histórico del viaje (`ChallengeDetail`) — puesto, avatar,
// nombre, puntos, distancia y tiempo de respuesta. `rankByUserId` alimenta
// también el badge de puesto de los pines del mapa de arriba (mismo orden).
import { ChallengeBoard, rankByUserId } from '../group/ChallengeBoard'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { GameScene, type GameSceneData } from './GameScene'
import { CountdownOverlay } from './CountdownOverlay'
import { ExitConfirmModal } from './ExitConfirmModal'
import { NamePromptModal } from './NamePromptModal'
import { sceneMedium } from './sceneMedium'
import { PlayNumberChallenge } from './PlayNumberChallenge'
import { ResultCard } from './ResultCard'
import { RevealBurst } from './RevealBurst'
import { remainingSeconds } from './resumeState'
import { SceneImage } from './SceneImage'
import { buildChallengeLink, buildResultShareText } from './shareResult'
import {
  getAnswer,
  getChallengeOrNull,
  isPracticeChallenge,
  type ChallengeForPlay,
} from '../../lib/challenges'
import {
  deleteMyVote,
  getExistingVote,
  getVotes,
  getVotesWithNames,
  startPlay,
  submitVote,
} from '../../lib/votes'
import { getGroup } from '../../lib/groupData'
import { getGroupMembers } from '../../lib/membership'
import { aggregateLeaderboard, getGroupVotes, type VoteWithName } from '../../lib/leaderboard'
import { upsertProfile } from '../../lib/profile'
import { marcadorGroupHash } from '../../lib/route'
import { type Result } from '../../lib/result'
import { fmtDist, speedFactor, type LatLng } from '../../lib/geo'
import { track } from '../../lib/analytics'
import { ChallengeClosedError, describeError, ResourceGoneError } from '../../lib/errors'
import { addBreadcrumb, reportError } from '../../lib/observability'
import { useSession } from '../../lib/session-context'
import { useSignedImage } from '../../lib/useSignedImage'
import { useVisualViewport } from '../../lib/useVisualViewport'
import { useOwnChallengeGuard } from './useOwnChallengeGuard'
import { describeChallengeClosure, isChallengeClosed } from './challengeClosure'
// Rasterización + compartir reutilizadas de la tarjeta de clasificación (import
// READ-ONLY: no se edita ese módulo). Mismo estándar de snapshot y Web Share API.
import { nodeToPngBlob, shareDomain, shareLeaderboardImage } from '../group/shareLeaderboard'
// "Guárdate / entra del todo" (issue #758): CTA opcional tras jugar, para el
// receptor ANÓNIMO. Vive en features/auth (vincula uid), esta pantalla solo la
// invoca. `RecoverIdentityModal` (issue #756) es su hermana para el caso
// "nombre repetido": en vez de vincular el uid anónimo actual a un email
// nuevo, RECUPERA el uid de una cuenta ya existente (mismo nombre en el viaje).
import { AccountUpgradeModal, RecoverIdentityModal } from '../auth'
// Pre-prompt de push (issue #769): tras revelar, SOLO para cuentas (el
// anónimo ya tiene aquí mismo el CTA "no pierdas tus puntos" de arriba —
// AccountUpgradeModal/RecoverIdentityModal — y nunca se apilan dos prompts).
import { PushOptInPrompt } from '../trip/PushOptInPrompt'
// Entrada por RETO COMPARTIDO (onboarding nuevo, pieza 2/4): quien abre un
// deep link de UN reto suelto sin cuenta y por primera vez ve una intro mínima
// ANTES de jugar (RetoShareIntro) y, tras el resultado y a PETICIÓN, la guía
// que señala el resultado real y explica el Marcador (RetoShareGuide). El motor
// de detección/persistencia vive en `useRetoShareOnboarding`; aquí solo se engancha.
import { RetoShareIntro, RetoShareGuide, useRetoShareOnboarding } from '../onboarding'
import {
  BackHomeButton,
  Button,
  Card,
  ChallengePhoto,
  CountUp,
  Icon,
  Row,
  ScoreRing,
  Skeleton,
  Spinner,
  Stack,
  useReducedMotion,
  useToast,
} from '../../ui'
import { IconDiana, IconMedalla, IconTrofeo } from '../../ui/icons'

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

// Fases del juego. El overlay "Empezar" tapa todo en `idle`; al pulsar Empezar se
// pasa por `countdown` (3·2·1 sobre la foto del reto) antes de `playing`; el reloj
// de la jugada solo corre en `playing`; tras `revealed` el voto queda fijo. `own`
// es la guarda defensiva (#509): el creador del reto no juega el suyo propio, ni
// aunque llegue por un enlace directo. `gone` (issue #760): el reto se borró
// entre que se compartió el enlace y que se abrió/jugó (0 filas al cargar, o
// P0002 de la RPC al votar) — pantalla amable, no un error crudo.
type Phase = 'loading' | 'idle' | 'countdown' | 'playing' | 'revealed' | 'own' | 'gone' | 'closed'

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

// Guarda de tipo (issue #795): un voto de TIMEOUT ajeno no trae guess_lat/lng
// (jugó pero no marcó), así que no hay dónde clavar su pin en el mapa de
// resultado — se filtra antes de construir `GuessMarker[]`.
function hasGuessLocation(
  v: VoteWithName,
): v is VoteWithName & { guess_lat: number; guess_lng: number } {
  return v.guess_lat != null && v.guess_lng != null
}

// Háptica sutil (solo donde el navegador la soporte; iOS Safari la ignora). El
// llamador ya filtra reduced-motion: aquí solo disparamos el patrón si existe la
// API. Un toque corto al colocar el pin; un patrón al revelar un gran acierto.
function haptic(pattern: number | number[]) {
  navigator.vibrate?.(pattern)
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
  // Si MI propio voto salió de la app durante la jugada: alimenta el aviso del
  // resultado. Se fija al votar (desde leftAppRef) y al recargar un voto previo.
  const [iLeftApp, setILeftApp] = useState(false)
  const [saving, setSaving] = useState(false)
  // Posición del jugador en este reto (1 = mejor). Solo informativa: alimenta la
  // propiedad de analítica `rank_in_challenge` y el texto "Nº de N" del resultado.
  // Se calcula con los votos del reto tras revelar (no se conoce antes de votar).
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null)
  // Votos con nombre de TODOS los que ya jugaron este reto (issue #795): pinta
  // sus pines en el mapa del resultado. Se resuelve tras revelar (fresco o al
  // recargar un voto ya emitido) — nunca antes: la RLS ya exige haber votado
  // para leer `votes`, pero además NO llamamos a esta consulta en ninguna fase
  // previa (`idle`/`playing`), así que quien no ha jugado no ve nada aunque la
  // policy se lo permitiera. Reutiliza la MISMA consulta que ya alimentaba el
  // ranking (antes `getVotes`, ahora `getVotesWithNames`: una sola llamada para
  // las dos cosas, no dos).
  const [allGuesses, setAllGuesses] = useState<VoteWithName[]>([])
  // Selección fila↔pin (issue #824): tocar una fila de `ChallengeBoard` resalta
  // su pin en `AllGuessesMap`, más abajo en el revelado. Vive aquí (el padre de
  // ambas superficies) y baja a las dos como `selectedUserId`.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  // Tiempo de respuesta + factor de velocidad para el revelado (issue #628). Solo
  // tiene sentido con límite por jugada (guess_seconds no null): sin límite
  // ("Libre") no hay contra qué medir. `factor` es null cuando no se puede
  // confirmar que aplicó (degradación honesta): entonces solo se enseña el
  // tiempo, sin la nota "×0,9 por rapidez".
  const [speedInfo, setSpeedInfo] = useState<{ seconds: number; factor: number | null } | null>(
    null,
  )
  // Nombre del grupo para la tarjeta de "compartir mi resultado". El componente
  // solo recibe el código del grupo (groupId); el nombre lo leemos aparte. Null
  // hasta resolver (o si no hay grupo / falla): la tarjeta cae a "tu grupo".
  const [groupName, setGroupName] = useState<string | null>(null)
  // Guarda "es tuyo" (#509), compartida con PlayNumberChallenge (#579): el
  // creador ve cuánta gente ha jugado ya, sin entrar al juego.
  const { ownVoteCount, checkOwn } = useOwnChallengeGuard(getVotes)
  // Compartir mi resultado: estado del PNG. `sharingResult` deshabilita el botón
  // mientras se rasteriza/comparte; el ref apunta a la tarjeta montada fuera del
  // viewport para el snapshot (mismo patrón que ShareLeaderboardModal).
  const [sharingResult, setSharingResult] = useState(false)
  const resultCardRef = useRef<HTMLDivElement>(null)
  // Mapa de adivinar como hoja inferior (bottom sheet): el asa-pastilla del mapa
  // la sube; dentro se coloca el pin y se confirma; cerrar vuelve al panorama.
  const [mapOpen, setMapOpen] = useState(false)
  // Orientación actual del panorama (0=N). La provee el panorama vía callback y
  // alimenta la brújula. Sin esto la aguja no seguiría el giro.
  // Tras revelar el Street View es secundario: oculto hasta que se pide verlo.
  const [showStreetView, setShowStreetView] = useState(false)
  // Reto de FOTO (sin Street View): la escena se recorta para llenar la pantalla,
  // así que ofrecemos verla COMPLETA y poder ampliarla en un visor a pantalla
  // completa (zoom + pan). Sin esto la foto se ve cortada y no se puede inspeccionar.
  const [photoExpanded, setPhotoExpanded] = useState(false)
  // Confirmación de "salir mientras juegas" (issue #663): sustituye window.confirm
  // por el modal del UI kit (ver ExitConfirmModal).
  const [confirmingExit, setConfirmingExit] = useState(false)
  const toast = useToast()
  // Anti-trampa (issue #200): si el jugador cambia de pestaña/app MIENTRAS el reloj
  // corre (fase `playing`, antes de votar), lo marcamos. Ref (no estado) porque el
  // valor solo se lee al votar; no necesita re-render y debe persistir hasta el voto.
  const leftAppRef = useRef(false)
  // Tiempo de respuesta (issue #214): instante (ms epoch) en que el jugador empezó
  // a jugar (entrada en `playing`). Al votar medimos los segundos transcurridos en
  // wall-clock. Es coherente con que "el tiempo sigue corriendo aunque salgas": no
  // descontamos pausas; si reanuda, el inicio NO se reinicia (se reconstruye desde
  // el `start_at` persistido, igual que el reloj de la cuenta atrás). Null si no hay
  // inicio válido → mandamos `null` y no rompemos el voto.
  const playStartAtRef = useRef<number | null>(null)
  // Handle imperativo del panorama para los controles "volver al inicio" / "norte".
  const panoRef = useRef<StreetViewPanoHandle>(null)
  // La identidad es la sesión: el voto se atribuye a `user.id` (no a un nombre).
  // El perfil aporta el avatar para pintar la burbuja del pin del propio jugador.
  // `isAnonymous`/`refreshProfile` alimentan el receptor sin cuenta (issue #758):
  // pedir el nombre antes de revelar y ofrecer "guárdate" tras el resultado.
  const { user, profile, isAnonymous, refreshProfile } = useSession()
  // Nombre antes de revelar (issue #758): un receptor ANÓNIMO sin display_name
  // aún elegido vería "—" en el marcador. Se pide UNA vez, justo antes de
  // llamar a `submitVote`; `pendingRevealRef` guarda la jugada en curso mientras
  // el modal está abierto y la retoma al guardar el nombre.
  const [nameOpen, setNameOpen] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const pendingRevealRef = useRef<{ current: ChallengeForPlay; playedGuess: LatLng | null } | null>(
    null,
  )
  // Nombre repetido = puerta de recuperación (issue #756): si el nombre
  // coincide con el de otro miembro del viaje, `submitName` NO lo guarda —
  // aparca la decisión aquí. No-null cambia `NamePromptModal` al paso "¿Eres
  // tú?"; `recoverOpen` abre el login OTP normal (RecoverIdentityModal) si
  // elige "Soy yo". `recoveringRef` es la señal para el efecto de abajo: tras
  // verificar el código, la sesión cambia de uid de forma asíncrona
  // (`onAuthStateChange`), así que no podemos retomar la jugada aparcada en el
  // mismo tick — esperamos a que `user` cambie de verdad.
  const [conflictName, setConflictName] = useState<string | null>(null)
  const [recoverOpen, setRecoverOpen] = useState(false)
  const recoveringRef = useRef(false)
  // "Guárdate / entra del todo" (issue #758): CTA opcional en el resultado para
  // el receptor anónimo. Sin relación con el nombre de arriba: se puede jugar
  // con nombre y seguir sin cuenta permanente indefinidamente.
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  // Entrada por RETO COMPARTIDO (onboarding nuevo, pieza 2/4): intro mínima
  // antes de jugar + explicación tras el resultado, solo para quien abre un
  // deep link de reto sin cuenta y por primera vez (ver useRetoShareOnboarding).
  const retoShare = useRetoShareOnboarding(groupId, user?.id, isAnonymous, profile?.onboarding)
  const [retoIntroDismissed, setRetoIntroDismissed] = useState(false)
  // Fin del recorrido de la guía del reto compartido (issue #888): NO hace
  // falta un flag "ya empezó" aparte — el render de más abajo YA vive dentro
  // de la rama `revealed` (todo lo que sigue tras `if (!revealed) return …`),
  // así que la guía arranca SOLA en cuanto se revela (mientras `retoShare.active`
  // sea true, "solo la 1ª vez" lo da ese propio flag) sin un efecto que ponga
  // estado — evita el cascading-render que un `setState` síncrono en un efecto
  // dispararía sin aportar nada (antes existía para gatear el botón "¿Qué es
  // esto?", que ya no existe).
  const [retoExplainDone, setRetoExplainDone] = useState(false)
  // Ancla REAL del reveal para el coach-mark de la guía (RetoShareGuide,
  // rediseño #891): la tarjeta de puntuación ("tu resultado"). Barata: ref
  // vacía salvo en el reveal. El resto de la explicación ya no vive aquí —
  // se recorre en el viaje real (tour de TripPage).
  const revealResultRef = useRef<HTMLDivElement>(null)
  // Intensidad del CTA a partir de la 2ª partida (issue #756): recuento del
  // receptor anónimo EN ESTE VIAJE (no solo este reto). Se resuelve reusando
  // `getGroupVotes`/`aggregateLeaderboard` (ya existen para el marcador, sin
  // query nueva) solo tras revelar y solo para anónimos — no es un dato que
  // haga falta en el camino de jugar.
  const [anonTally, setAnonTally] = useState<{ plays: number; points: number } | null>(null)
  // Respeto de reduced-motion: sin animaciones ⇒ tampoco háptica (un golpe de
  // vibración es "movimiento" para quien lo desactiva). Guardamos en un ref para
  // leerlo dentro de callbacks memoizados sin cambiar su identidad.
  const reducedMotion = useReducedMotion()
  const reducedMotionRef = useRef(reducedMotion)
  useEffect(() => {
    reducedMotionRef.current = reducedMotion
  }, [reducedMotion])
  // URL firmada de la foto del reto (bucket privado). Hook al tope del componente
  // —no tras los early-return de carga— para no romper el orden de hooks.
  const photoUrl = useSignedImage(challenge?.image_path ?? null)
  // Alto visible real para el modelo de viewport de la escena inmersiva: al abrir el
  // mapa/teclado del navegador móvil, atamos el contenedor a este alto en px en vez
  // de a 100vh (que colapsa y empuja la pregunta/escena fuera de pantalla).
  const { height: visualHeight } = useVisualViewport()

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
      // Marca anti-trampa: si salió de la app durante la jugada, la propagamos al
      // voto y la reflejamos en el aviso del resultado.
      const leftApp = leftAppRef.current
      if (leftApp) setILeftApp(true)
      // Tiempo de respuesta (issue #214): segundos en wall-clock desde que empezó a
      // jugar hasta este voto. Sin inicio válido → null (no rompe el voto).
      const startedAt = playStartAtRef.current
      const elapsedSeconds = startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : null
      try {
        const res = await submitVote({
          challengeId: current.id,
          guessLat: playedGuess?.lat ?? null,
          guessLng: playedGuess?.lng ?? null,
          leftApp,
          elapsedSeconds,
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
            is_anonymous: isAnonymous,
          })
          // Aunque no marcó pin, SÍ jugó (issue #795): con el voto ya
          // persistido por submitVote de arriba, la RLS de challenge_answers
          // ya le deja ver la respuesta (condición "ya tiene un voto en este
          // reto"), así que puede ver el mapa de resultado con las jugadas del
          // resto igual que quien sí llegó a tiempo. Falla en silencio: sin
          // esto, simplemente no se pinta el mapa (ver el render de abajo).
          try {
            const ans = await getAnswer(current.id)
            if (ans) setAnswer(ans)
          } catch {
            // Sin respuesta: el resultado se muestra igual, sin mapa.
          }
          try {
            setAllGuesses(await getVotesWithNames(current.id))
          } catch {
            // Sin jugadas del resto: el resultado se muestra igual.
          }
          return
        }
        // El servidor devuelve distancia + puntos + la respuesta real para el pin.
        const km = res.distanceKm ?? 0
        setResult({ km, points: res.points })
        // Tiempo de respuesta + factor de velocidad (issue #628): solo con límite
        // por jugada (sin límite, "Libre", no hay nada que medir). El factor viene
        // del SERVIDOR (res.speedFactor): es la verdad de lo que se aplicó, no una
        // estimación del reloj local (que podría no coincidir si `start_play` falló).
        if (current.guess_seconds != null && elapsedSeconds != null) {
          setSpeedInfo({ seconds: elapsedSeconds, factor: res.speedFactor })
        }
        // Gran acierto: patrón háptico de celebración (si lo soporta y no hay
        // reduced-motion), en sincronía con el destello/confeti del revelado.
        if (res.points >= GREAT_SHOT && !reducedMotionRef.current) haptic([100, 50, 100])
        if (res.answerLat != null && res.answerLng != null) {
          setAnswer({ lat: res.answerLat, lng: res.answerLng })
        }
        // Posición en el reto: ranking estándar por puntos (1 + nº de votos con
        // MÁS puntos que el mío). Mi voto ya está persistido por submitVote, así
        // que getVotesWithNames lo incluye. Misma consulta que alimenta el mapa
        // de resultado (issue #795, `allGuesses`) — una sola llamada para las
        // dos cosas. Falla en silencio: el revelado no se bloquea por esto y,
        // sin rango, simplemente no añadimos la propiedad (tampoco el mapa).
        let rankPosition: number | null = null
        let rankTotal: number | null = null
        try {
          const votes = await getVotesWithNames(current.id)
          setAllGuesses(votes)
          if (votes.length > 0) {
            rankTotal = votes.length
            rankPosition = 1 + votes.filter((v) => v.points > res.points).length
            setRank({ position: rankPosition, total: rankTotal })
          }
        } catch {
          // Sin rango ni mapa de resultado: el resultado se muestra igual.
        }
        track('result_revealed', {
          group_id: current.group_id,
          challenge_id: current.id,
          timed_out: false,
          points: res.points,
          distance_km: km,
          is_anonymous: isAnonymous,
          // Solo si se pudo calcular (no rompemos el evento si falla la consulta).
          ...(rankPosition != null && { rank_in_challenge: rankPosition }),
        })
        // Arriba, no abajo (issue #891): tras revelar, el tutorial del reto
        // compartido monta un coach-mark cuya burbuja + "Siguiente" viven en la
        // mitad inferior — un toast abajo lo tapaba. Arriba nunca lo pisa.
        toast.show('¡Voto guardado!', { tone: 'success', position: 'top' })
      } catch (err) {
        if (err instanceof ResourceGoneError) {
          // Esperable (issue #760, LOCATIONGUESSER-10): el reto se borró con la
          // pantalla de jugar ya abierta. Breadcrumb, no excepción — no es un
          // fallo real de la app.
          addBreadcrumb('challenge_gone_on_vote', { challengeId: current.id })
          setPhase('gone')
          return
        }
        if (err instanceof ChallengeClosedError) {
          // Esperable (LOCATIONGUESSER-8): el plazo venció (o el dueño cerró el
          // grupo) con la pantalla de jugar abierta — el voto llegó tarde.
          addBreadcrumb('challenge_closed_on_vote', { challengeId: current.id })
          setPhase('closed')
          return
        }
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
    [toast, user, isAnonymous],
  )

  // Puerta previa al revelado (issue #758): si el jugador es un receptor
  // ANÓNIMO que aún no ha elegido nombre, abre el modal de nombre y APARCA la
  // jugada (NO llama a `reveal`); `submitName` la retoma al guardar. Mientras
  // el modal sigue abierto (needsName true) esta función es un no-op: la
  // cuenta atrás sigue llamándola cada 250ms una vez el tiempo llega a cero
  // (mientras `phase` siga en `playing`) y NO debe colarse a `reveal` sin
  // nombre solo porque el modal ya estaba abierto. Con nombre ya elegido (o
  // cuenta permanente), va directa a `reveal` como siempre.
  const maybeReveal = useCallback(
    (current: ChallengeForPlay, playedGuess: LatLng | null) => {
      const needsName = isAnonymous && !profile?.display_name?.trim()
      if (needsName) {
        if (!nameOpen) {
          pendingRevealRef.current = { current, playedGuess }
          setNameValue(profile?.display_name ?? '')
          setNameError(null)
          setNameOpen(true)
          // Paso ciego del funnel (issue #751): sin esto no se sabe cuánta
          // gente ve este modal antes de aparcarse a votar.
          track('name_prompt_shown', { group_id: current.group_id, challenge_id: current.id })
        }
        return
      }
      void reveal(current, playedGuess)
    },
    [reveal, isAnonymous, profile, nameOpen],
  )

  // Guarda el nombre y retoma la jugada aparcada. `upsertProfile` además del
  // trigger `handle_new_user`: para un anónimo, `profiles` ya existe (fila
  // vacía) desde el alta anónima, así que esto es un UPDATE de display_name.
  //
  // Nombre repetido = puerta de recuperación, no duplicado (issue #756): antes
  // de guardar, comprobamos si YA hay un miembro del viaje con este nombre
  // (case-insensitive, trim). Si lo hay, NO lo guardamos — aparcamos la
  // decisión en el paso "¿Eres tú?" del propio modal (`conflictName`); el
  // usuario elige entre recuperar su cuenta (RecoverIdentityModal) o elegir
  // otro nombre. Solo aplica con un viaje real (`groupId`): un reto de
  // práctica suelto no tiene "miembros" con los que chocar.
  async function submitName() {
    const name = nameValue.trim()
    if (name.length < 2) {
      setNameError('Pon al menos 2 caracteres.')
      return
    }
    if (!user) return
    setNameSaving(true)
    setNameError(null)
    const pendingForAnalytics = pendingRevealRef.current?.current
    const trackOutcome = (outcome: 'success' | 'error' | 'conflict') =>
      track('name_prompt_submitted', {
        outcome,
        ...(pendingForAnalytics && {
          group_id: pendingForAnalytics.group_id,
          challenge_id: pendingForAnalytics.id,
        }),
      })
    try {
      if (groupId) {
        const members = await getGroupMembers(groupId)
        const collision = members.find(
          (m) => m.userId !== user.id && m.name.trim().toLowerCase() === name.toLowerCase(),
        )
        if (collision) {
          trackOutcome('conflict')
          setConflictName(collision.name)
          return
        }
      }
      await upsertProfile({ id: user.id, displayName: name })
      await refreshProfile()
      trackOutcome('success')
      setNameOpen(false)
      const pending = pendingRevealRef.current
      pendingRevealRef.current = null
      if (pending) void reveal(pending.current, pending.playedGuess)
    } catch (err) {
      trackOutcome('error')
      setNameError(describeError(err))
    } finally {
      setNameSaving(false)
    }
  }

  // "No soy yo": vuelve al paso de nombre para elegir otro (issue #756). Deja
  // `nameOpen` intacto (sigue abierto) — solo se limpia el conflicto.
  function dismissConflict() {
    setConflictName(null)
    setNameError(null)
  }

  // "Soy yo": cede el paso a `RecoverIdentityModal` (login OTP normal). El
  // nombre en conflicto (`conflictName`) NO se limpia aquí a propósito: sigue
  // haciendo falta para el copy de ese modal ("Ya hay un X..."); se limpia al
  // recuperar con éxito o si se cierra (`dismissConflict`).
  function confirmIsMe() {
    setNameOpen(false)
    setRecoverOpen(true)
  }

  // Cerrar `RecoverIdentityModal` sin completar (X/Escape/"Ahora no"): nunca
  // dejar al jugador en un callejón sin salida — vuelve al paso "¿Eres tú?"
  // (el conflicto sigue vivo) para que pueda reintentar o elegir otro nombre.
  function cancelRecover() {
    setRecoverOpen(false)
    setNameOpen(true)
  }

  // Código verificado con éxito (issue #756): la sesión YA es la de la cuenta
  // existente, pero el cambio de uid llega async vía `onAuthStateChange` — el
  // efecto de arriba (dependiente de `user`) hace el resto en cuanto se nota.
  function handleRecovered() {
    recoveringRef.current = true
  }

  // Carga del reto. Si el usuario ya votó, salta directo a revelado mostrando
  // su jugada (no se re-vota: regla anti-trampas + upsert por user_id).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const c = await getChallengeOrNull(challengeId)
        if (cancelled) return
        if (!c) {
          // Esperable (issue #760, LOCATIONGUESSER-Z): el dueño borró el reto
          // tras compartir el enlace. Breadcrumb, no excepción.
          addBreadcrumb('challenge_gone_on_load', { challengeId })
          setPhase('gone')
          return
        }
        setChallenge(c)

        // Guarda defensiva (#509): el creador no juega su propio reto, ni aunque
        // llegue por un enlace directo (el flujo normal ya no lo manda aquí tras
        // crear). Corta ANTES de mirar el tipo: aplica a lugar Y a número, sin
        // llegar a delegar en PlayNumberChallenge.
        if (await checkOwn(c, user?.id, { isCancelled: () => cancelled })) {
          if (!cancelled) setPhase('own')
          return
        }

        // Reto de NÚMERO ("¿Adivinas?"): lo juega PlayNumberChallenge (rama propia, sin
        // mapa). NO corremos aquí la lógica de lugar (voto previo de lat/lng, etc.); el
        // componente de número rehace su carga con `preloaded`. El reto de LUGAR sigue
        // exactamente igual debajo. (#323)
        if (c.challenge_kind === 'number') return

        // ¿Ya votó este usuario? → directo a su resultado (no se re-vota, ni
        // aunque el reto siga en vivo). La identidad es la sesión.
        const existing = user ? await getExistingVote(challengeId, user.id) : null
        if (cancelled) return
        if (existing) {
          // Recarga de un voto ya emitido: refleja la marca anti-trampa en el aviso.
          if (existing.left_app) setILeftApp(true)
          if (existing.guess_lat == null || existing.guess_lng == null) {
            // Voto de timeout: jugó pero no marcó → 0 pts, sin pin. Marcado como
            // jugado (no puede reintentar), se muestra "no diste a tiempo".
            setTimedOut(true)
          } else {
            setGuess({ lat: existing.guess_lat, lng: existing.guess_lng })
            setResult({ km: existing.distance_km ?? 0, points: existing.points })
            // Tiempo de respuesta + factor de velocidad (issue #628), reconstruidos
            // al recargar un voto ya emitido. `play_started_at` es el DATO de verdad
            // de si el servidor llegó a aplicar un factor (null = seguro que no, ni
            // se intenta estimar); con él presente, se recalcula el factor con el
            // MISMO `elapsed_seconds` ya persistido (muy cercano al que usó el
            // servidor en su momento) — es una nota informativa, no repuntúa nada.
            if (c.guess_seconds != null && existing.elapsed_seconds != null) {
              setSpeedInfo({
                seconds: existing.elapsed_seconds,
                factor:
                  existing.play_started_at != null
                    ? speedFactor(existing.elapsed_seconds, c.guess_seconds, c.time_scoring)
                    : null,
              })
            }
          }
          // Ya votó (con pin o de timeout): tiene derecho a ver la respuesta y las
          // jugadas del resto (issue #795) — la RLS de challenge_answers/votes las
          // sirve por tener un voto propio, con o sin pin. La pedimos aparte (no
          // viaja en el payload del reto). Fuera del if/else de arriba a propósito:
          // antes solo se pedía si el voto tenía pin; un timeout se quedaba sin
          // mapa de resultado aunque la policy ya se lo permitiera.
          const ans = await getAnswer(challengeId)
          if (cancelled) return
          if (ans) setAnswer(ans)
          // Posición en el reto para el texto "Nº de N" (recarga de un voto ya
          // emitido) + jugadas de todos para el mapa de resultado. Mismo ranking
          // por puntos; falla en silencio.
          try {
            const votes = await getVotesWithNames(challengeId)
            if (cancelled) return
            setAllGuesses(votes)
            if (votes.length > 0) {
              setRank({
                position: 1 + votes.filter((v) => v.points > existing.points).length,
                total: votes.length,
              })
            }
          } catch {
            // Sin rango ni mapa de resultado: el resultado se muestra igual.
          }
          setPhase('revealed')
          return
        }
        // Si ya se empezó (hay `start_at`), retomamos el juego sin volver a
        // mostrar el overlay "Empezar": una vez empezado NO se puede reiniciar
        // limpio saliendo y reentrando. Con tiempo, el reloj se reconstruye desde
        // el instante original (no se regala ni recorta); sin tiempo, sigue en
        // `playing`. Aplica también a retos sin límite (antes solo a los timed).
        // Reto ya CERRADO y sin voto propio (LOCATIONGUESSER-8): antes se entraba
        // a jugar igualmente y el choque llegaba al votar (P0001 del servidor).
        // Espejo cliente de la guarda `v_open` de submit_vote.
        if (isChallengeClosed(c.deadline_at)) {
          addBreadcrumb('challenge_closed_on_load', { challengeId })
          setPhase('closed')
          return
        }
        const resuming = localStorage.getItem(startKey(c.id)) != null
        setPhase(resuming ? 'playing' : 'idle')
        // Entró a la pantalla del reto SIN haber votado aún (issue #751): mide la
        // caída "entró pero no jugó" (challenge_opened → challenge_played). No se
        // emite en los caminos de arriba (own/ya votado): ahí no entra A JUGAR.
        track('challenge_opened', {
          group_id: c.group_id,
          challenge_id: c.id,
          challenge_kind: 'location',
        })
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
  }, [challengeId, user, checkOwn])

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

  // Recuento del receptor anónimo EN EL VIAJE, para intensificar el CTA de
  // guardar cuenta a partir de la 2ª partida (issue #756). Solo tras revelar
  // (no hace falta antes) y solo para anónimos (quien ya tiene cuenta no ve
  // este CTA). Reutiliza `getGroupVotes`/`aggregateLeaderboard` — el mismo par
  // que ya alimenta el marcador — en vez de una consulta nueva. Falla en
  // silencio: sin tally, el CTA cae a la versión de "esta partida" (aún
  // correcta, solo menos intensa).
  useEffect(() => {
    if (phase !== 'revealed' || !isAnonymous || !groupId || !user) return
    let cancelled = false
    void getGroupVotes(groupId)
      .then((votes) => {
        if (cancelled) return
        const mine = aggregateLeaderboard(votes).find((entry) => entry.userId === user.id)
        if (mine) setAnonTally({ plays: mine.plays, points: mine.points })
      })
      .catch(() => {
        // Sin tally: el CTA usa el fallback de "esta partida" (result.points).
      })
    return () => {
      cancelled = true
    }
  }, [phase, isAnonymous, groupId, user])

  // Recuperación de identidad (issue #756): tras verificar el código de
  // `RecoverIdentityModal`, la sesión pasa a ser la de la cuenta EXISTENTE
  // (otro uid) vía `onAuthStateChange` — asíncrono, no ocurre en el mismo tick
  // que `onRecovered()`. Marcamos la intención con el ref y esperamos a que
  // `user` cambie de verdad para retomar la jugada aparcada (mismo patrón que
  // `maybeReveal`/`submitName`, pero como el nuevo usuario YA tiene nombre en
  // este viaje —así lo detectamos—, no hace falta volver a pedirlo ni tocar su
  // perfil.
  useEffect(() => {
    if (!recoveringRef.current) return
    recoveringRef.current = false
    setRecoverOpen(false)
    setConflictName(null)
    const pending = pendingRevealRef.current
    pendingRevealRef.current = null
    if (pending) void reveal(pending.current, pending.playedGuess)
  }, [user, reveal])

  // Inicio del cronómetro de respuesta (issue #214). Al entrar en `playing`
  // fijamos el origen desde el `start_at` persistido (el mismo que reconstruye la
  // cuenta atrás): así una recarga o un salir-y-reentrar NO reinicia el contador,
  // y el tiempo medido es wall-clock real desde que se pulsó Empezar.
  useEffect(() => {
    if (phase !== 'playing' || !challenge) return
    const startAt = Number(localStorage.getItem(startKey(challenge.id)) ?? Date.now())
    playStartAtRef.current = startAt
  }, [phase, challenge])

  // Cuenta atrás. Arranca al entrar en `playing` reconstruyendo desde `start_at`
  // (persistido), así una recarga no reinicia el reloj. Al llegar a 0 → revelar.
  useEffect(() => {
    if (phase !== 'playing' || !challenge || challenge.guess_seconds == null) return
    const total = challenge.guess_seconds
    const startAt = Number(localStorage.getItem(startKey(challenge.id)) ?? Date.now())

    const tick = () => {
      const left = remainingSeconds(total, startAt, Date.now())
      setRemaining(left)
      if (left <= 0) {
        maybeReveal(challenge, guess)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, challenge, guess, maybeReveal])

  // Anti-trampa (issue #200): SOLO durante `playing` (reloj corriendo, antes de
  // votar) escuchamos `visibilitychange`. Si la pestaña/app se oculta (el jugador
  // se va a buscar la respuesta), marcamos el ref; persiste hasta el voto. El
  // listener se limpia al salir de `playing` o al desmontar. NO marca nada tras
  // revelar/votar (ahí salir es legítimo: el resultado ya está fijado).
  useEffect(() => {
    if (phase !== 'playing') return
    const onVisibility = () => {
      if (document.hidden) leftAppRef.current = true
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [phase])

  // Colocar/mover el pin de la adivinanza: además de fijar la posición, damos un
  // toque háptico sutil (si el navegador lo soporta y no hay reduced-motion) para
  // que colocar el pin se sienta más satisfactorio.
  function placeGuess(p: LatLng) {
    setGuess(p)
    if (!reducedMotionRef.current) haptic(80)
  }

  // Autoridad de servidor para el factor de velocidad (issue #628): registra el
  // arranque ANTES de que corra el reloj. Best-effort con UN reintento corto: si
  // las dos llamadas fallan, el juego sigue igual — sin arranque registrado,
  // `submit_vote` aplicará factor 1 (degradación honesta, nunca bloquea la
  // partida). Fire-and-forget desde `start()`: no retrasa la cuenta atrás.
  async function callStartPlay(id: string) {
    try {
      await startPlay(id)
    } catch {
      try {
        await startPlay(id)
      } catch (err) {
        reportError(err, { area: 'start_play', challengeId: id })
      }
    }
  }

  function start() {
    if (!challenge) return
    void callStartPlay(challenge.id)
    // Empezar NO arranca el reloj: primero la cuenta atrás 3·2·1 (sobre la foto del
    // reto). El `start_at` se fija al TERMINAR la cuenta (beginPlaying), para que el
    // reloj de la jugada arranque tras el 3-2-1, no durante. Si el jugador recarga
    // durante la cuenta (aún sin start_at), vuelve a "¿Listo?": no perdió tiempo.
    setPhase('countdown')
  }

  // Fin de la cuenta atrás 3·2·1 → entra en juego. Aquí (no en `start`) fijamos el
  // inicio SIEMPRE (con o sin límite): así, al salir y reentrar, el reto se REANUDA
  // en `playing` y nunca vuelve a "¿Listo para jugar?" (no hay reinicio limpio). Con
  // límite, además fija el origen del reloj para reconstruir el tiempo restante.
  function beginPlaying() {
    if (!challenge) return
    localStorage.setItem(startKey(challenge.id), String(Date.now()))
    setPhase('playing')
  }

  function confirm() {
    if (challenge && guess) {
      // Adivinanza enviada (con pin). El timeout sin marcar NO es "jugar": no
      // hubo adivinanza, se contabiliza solo como result_revealed (timed_out).
      track('challenge_played', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
        challenge_kind: 'location',
        is_anonymous: isAnonymous,
      })
      maybeReveal(challenge, guess)
    }
  }

  // Salida siempre disponible: nunca dejar al jugador atrapado en el reto. Si
  // venimos de un grupo (deep link `#g=…&c=…`) volvemos a su clasificación; si
  // no, a la home (hash vacío). El `start_at` persistido deja el reloj intacto
  // si se vuelve a entrar a media jugada.
  function goBack() {
    location.hash = groupId ? `#g=${groupId}` : ''
  }

  // Salir DURANTE la jugada: el reloj NO se pausa (el reto sigue corriendo y al
  // reentrar se reanuda, nunca reinicia). Lo confirmamos (modal, no window.confirm)
  // para que el jugador sepa que salir no le da un reinicio limpio ni congela el
  // tiempo. El mensaje exacto vive en ExitConfirmModal.
  function goBackWhilePlaying() {
    setConfirmingExit(true)
  }

  function confirmExit() {
    setConfirmingExit(false)
    goBack()
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
      const name = groupName ?? 'tu viaje'
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
      // Reinicio limpio de la marca anti-trampa: rejugar arranca sin "salió".
      leftAppRef.current = false
      // Reinicio del cronómetro de respuesta: rejugar mide desde el nuevo Empezar.
      playStartAtRef.current = null
      setILeftApp(false)
      setRank(null)
      setSpeedInfo(null)
      setMapOpen(false)
      setShowStreetView(false)
      setSaving(false)
      setSharingResult(false)
      setPhase('idle')
      track('challenge_replayed', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
        challenge_kind: 'location',
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

  // Guarda "es tuyo" (#509): el creador no juega su propio reto. Va ANTES del
  // despacho por tipo (lugar/número): no llegamos a montar ningún juego.
  // Hallazgo #4 (auditoría de retos, #579): antes la tarjeta quedaba pegada
  // arriba con 2/3 de pantalla en blanco. El "atrás" queda anclado arriba (como
  // en el resto de la app); el bloque informativo se centra en el espacio
  // restante y se enriquece con un mini-resumen del estado (cierra en X /
  // cerrado), además del recuento de jugadas que ya tenía.
  if (phase === 'own' && challenge) {
    const backLabelOwn = groupId ? 'Volver al viaje' : 'Inicio'
    return (
      <main className={`lg-page ${styles.ownPage}`}>
        <BackHomeButton onClick={goBack} label={backLabelOwn} />
        <div className={styles.ownCenter}>
          <Stack gap={4} align="center">
            <Stack gap={2} className={styles.header} align="center">
              <h1 className={styles.title}>{challenge.title}</h1>
            </Stack>
            <Card padding="md" raised>
              <Stack gap={3} align="center">
                <IconTrofeo size={40} />
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
                    <span className={styles.inlineIcon}>
                      <IconTrofeo size={18} />
                      Ver marcador
                    </span>
                  </Button>
                )}
                <Button variant="secondary" fullWidth onClick={goBack}>
                  Volver al viaje
                </Button>
              </Stack>
            </Card>
          </Stack>
        </div>
      </main>
    )
  }

  // Reto/viaje borrado (issue #760): el dueño lo borró tras compartir el enlace
  // (al cargar) o mientras la pantalla estaba abierta (al votar). Va ANTES del
  // resto de fases: en `gone`, `challenge` puede ser `null` (borrado al cargar),
  // así que no podemos depender de él para el copy — mensaje genérico visual-first
  // (icono + una línea), mismo patrón de tarjeta centrada que la guarda "es tuyo".
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

  // Reto CERRADO sin voto propio (LOCATIONGUESSER-8): el plazo venció antes de
  // llegar (al cargar) o mientras se jugaba (al votar). Mismo patrón de tarjeta
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

  // Reto de NÚMERO ("¿Adivinas?"): rama propia (sin mapa). En cuanto se conoce el tipo
  // lo delegamos en PlayNumberChallenge con el reto ya cargado (preloaded), evitando
  // un segundo fetch. El reto de LUGAR sigue intacto en todo lo de abajo. (#323)
  if (challenge && challenge.challenge_kind === 'number') {
    return <PlayNumberChallenge challengeId={challengeId} groupId={groupId} preloaded={challenge} />
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
  const backLabel = groupId ? 'Volver al viaje' : 'Inicio'
  // Pines de TODOS los que ya jugaron, para el mapa de resultado (issue #795).
  // Filtra los votos de TIMEOUT (propio o ajeno): jugaron pero no marcaron pin,
  // no hay dónde clavarlos. Con MI timeout, `resultGuesses` simplemente no
  // lleva mi pin (correcto: no marqué) — el mapa se pinta igual con quien sí
  // marcó, siempre que la respuesta llegara a resolverse (ver el render de
  // abajo: sin `answer` cae al PlayMap de siempre). El PUESTO de cada pin
  // (issue #811, badge del pin) sale del MISMO orden que `ChallengeBoard` de
  // abajo (`rankByUserId`, no un criterio propio recalculado aquí).
  const rankOfGuess = rankByUserId(allGuesses, user?.id ?? null)
  const resultGuesses: GuessMarker[] = allGuesses.filter(hasGuessLocation).map((v) => ({
    userId: v.user_id,
    name: v.display_name,
    avatar: v.avatar,
    lat: v.guess_lat,
    lng: v.guess_lng,
    // Ver el comentario del `?? 0` gemelo en `ChallengeDetail.guessMarkersOf`:
    // `rankOfGuess` sale de la MISMA lista de votos, siempre tiene entrada.
    rank: rankOfGuess.get(v.user_id) ?? 0,
  }))
  // Reto de práctica: plazo lejano (>1 año). Solo en estos mostramos "volver a
  // jugar" tras revelar; en un reto real rejugar tras ver la respuesta sería trampa.
  const isPractice = isPracticeChallenge(challenge.deadline_at)
  // Copy del CTA "guárdate" reencuadrado al beneficio (issue #756): puntos, no
  // "cuenta". Por defecto enseña los puntos de ESTA partida (ya en pantalla);
  // a partir de la 2ª partida como anónimo EN ESTE VIAJE (`anonTally`) sube de
  // intensidad con el acumulado del viaje y variant primaria.
  const groupLabel = groupName ?? 'tu viaje'
  const intensifiedUpgrade = anonTally && anonTally.plays >= 2 ? anonTally : null
  const upgradeCtaLabel = intensifiedUpgrade
    ? `Llevas ${intensifiedUpgrade.plays} partidas y ${intensifiedUpgrade.points} puntos — guárdalos`
    : result
      ? `No pierdas tus ${result.points} puntos de ${groupLabel}`
      : `Guarda tu progreso en ${groupLabel}`
  const upgradePoints = intensifiedUpgrade
    ? intensifiedUpgrade.points
    : (result?.points ?? undefined)

  // --------------------------------------------------------------------------
  // Fase de JUGAR: experiencia inmersiva a pantalla completa.
  // Sale del wrapper `lg-page`: contenedor fijo cubriendo el viewport, escena
  // edge-to-edge y controles flotando por encima (brújula+timer, FAB del mapa,
  // controles del panorama, hoja inferior con el mapa de adivinar). Se monta en
  // `playing` e `idle` (el overlay "Empezar" tapa la escena ya cargada detrás).
  // --------------------------------------------------------------------------
  if (!revealed) {
    // NO-SPOILER: la escena (panorama o foto) NO se monta hasta `playing`. En
    // `idle` (overlay "Empezar") montarla dejaba ver el Street View / la foto por
    // detrás del modal y daba pistas. Hasta pulsar Empezar mostramos un
    // placeholder neutro; la escena real solo aparece tras `start()`.
    const playing = phase === 'playing'
    // Escena reutilizable (la misma que la PREVIA de crear). Toda la lógica (votar,
    // reloj, anti-trampa, salir) sigue aquí: GameScene es solo presentacional.
    const sceneData: GameSceneData = hasStreetView
      ? {
          kind: 'streetview',
          panoId: challenge.sv_pano_id,
          position: panoFallback,
          heading: challenge.sv_heading,
          pitch: challenge.sv_pitch,
          lockMove: challenge.sv_lock_move,
          lockRotate: challenge.sv_lock_rotate,
          hintPhotoUrl,
        }
      : { kind: 'photo', photoUrl: imageUrl }
    return (
      <>
        <GameScene
          title={challenge.title}
          scene={sceneData}
          viewportHeight={visualHeight}
          sceneReady={playing}
          // En `playing` con límite mostramos el anillo; sin empezar/sin límite, null.
          remaining={playing && challenge.guess_seconds != null ? remaining : null}
          guessSeconds={challenge.guess_seconds}
          // En `playing` salir NO pausa el reloj: lo confirmamos y lo decimos en el
          // rótulo. En `idle` (aún sin empezar) la salida es directa.
          backLabel={playing ? 'Salir (sigue el tiempo)' : backLabel}
          onBack={playing ? goBackWhilePlaying : goBack}
          guess={guess}
          onGuess={placeGuess}
          mapOpen={mapOpen}
          onOpenMap={() => setMapOpen(true)}
          onCloseMap={() => setMapOpen(false)}
          meAvatar={profile?.avatar_url}
          meUserId={user?.id ?? ''}
          onConfirm={confirm}
          photoExpanded={photoExpanded}
          onExpandPhoto={() => setPhotoExpanded(true)}
          onClosePhoto={() => setPhotoExpanded(false)}
          panoRef={panoRef}
          startOverlay={{
            open: phase === 'idle',
            onStart: start,
            onClose: goBack,
            // Anticipación, no explicación (#545): una diana (el icono ya asociado a
            // "adivinar" en el mini-mapa/resultado) con un pulso ACOTADO —2 pasadas,
            // nunca infinito (regla dura de motion: entrada o feedback, no decoración
            // en bucle)— y UNA línea que dice qué va a pasar. El límite de tiempo, si
            // lo hay, es un chip (dato), no una frase.
            body: (
              <>
                <IconDiana size={64} className={styles.introIcon} />
                <p className={styles.introLine}>
                  {/* Caso foto+SV (issue #789): solo cuando la foto es PISTA visible
                      durante la ronda (`hintPhotoUrl`) — la foto "sorpresa" (revelado)
                      no se ve hasta el final, así que no tiene sentido anunciarla aquí.
                      "dónde es" (no "dónde están", pese a la petición literal del
                      dueño): singular, coherente con el resto del copy de la app
                      ("adivina dónde es", "¿dónde es?"). */}
                  {hasStreetView && hintPhotoUrl
                    ? 'Mira la foto y el Street View para intentar adivinar dónde es'
                    : hasStreetView
                      ? 'Mira el panorama y clava tu pin'
                      : 'Mira la foto y clava tu pin'}
                </p>
                {challenge.guess_seconds != null && (
                  <span className={styles.introTimeChip}>
                    <Icon icon={Timer} size={14} />
                    {challenge.guess_seconds} s
                  </span>
                )}
              </>
            ),
          }}
        />

        {/* Cuenta atrás 3·2·1 tras pulsar Empezar: tapa la escena (que aún no se
            monta: sceneReady sigue false en `countdown`) con la FOTO del reto de
            fondo. Al terminar arranca el juego y, con él, el reloj de la jugada.
            Bajo reduced-motion el overlay entra directo a `playing` sin pausa. */}
        {phase === 'countdown' && <CountdownOverlay photoUrl={photoUrl} onDone={beginPlaying} />}

        <ExitConfirmModal
          open={confirmingExit}
          timed={challenge.guess_seconds != null}
          onConfirm={confirmExit}
          onCancel={() => setConfirmingExit(false)}
        />

        {/* Nombre antes de revelar (issue #758): solo se monta si hace falta
            (maybeReveal lo abre). No es descartable: sin nombre, el marcador
            no sabría de quién es este puesto. Nombre repetido = puerta de
            recuperación (issue #756): `conflictName` cambia el modal al paso
            "¿Eres tú?" en vez de guardar un duplicado. */}
        <NamePromptModal
          open={nameOpen}
          name={nameValue}
          onNameChange={setNameValue}
          onSubmit={() => void submitName()}
          saving={nameSaving}
          error={nameError}
          conflictName={conflictName}
          onDismissConflict={dismissConflict}
          onConfirmIsMe={confirmIsMe}
        />

        {/* "Soy yo" (issue #756): login OTP normal para recuperar la cuenta
            existente que juega con este nombre en el viaje. Cancelar vuelve al
            paso "¿Eres tú?" (nunca a un callejón sin salida). */}
        <RecoverIdentityModal
          open={recoverOpen}
          matchedName={conflictName ?? ''}
          onClose={cancelRecover}
          onRecovered={handleRecovered}
        />

        {/* Entrada por reto compartido (onboarding pieza 2/4): intro mínima
            ANTES de jugar — solo en `idle` (aún no se pulsó "Empezar"), solo
            la primera vez. "Jugar" solo la cierra; el flujo de jugar de
            siempre (overlay "Empezar" → cuenta atrás) sigue igual detrás. */}
        {retoShare.active && phase === 'idle' && !retoIntroDismissed && (
          <RetoShareIntro photoUrl={photoUrl} onPlay={() => setRetoIntroDismissed(true)} />
        )}
      </>
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

        {/* Mapa del resultado: DÓNDE apostaste vs el objetivo. Es el "resultado
            que obtuviste" real (no solo la cifra de puntos), así que es lo que
            resalta el primer coach-mark del reto compartido (RetoShareGuide) —
            para que el receptor VEA su tiro, no solo lea los puntos. */}
        <div ref={revealResultRef} className={`${styles.resultMap} lg-rise`}>
          {/* Issue #795: con respuesta conocida, el mapa de resultado enseña el
              pin de TODOS los que ya jugaron (con su nombre), no solo el mío.
              Sin respuesta todavía (p.ej. un fallo puntual al pedirla) cae al
              PlayMap de siempre — mi pin + el mundo, sin bloquear el resultado. */}
          {answer ? (
            <AllGuessesMap
              answer={answer}
              guesses={resultGuesses}
              meUserId={user?.id ?? ''}
              selectedUserId={selectedUserId}
            />
          ) : (
            <PlayMap
              guess={guess}
              answer={answer}
              locked
              onPick={setGuess}
              meAvatar={profile?.avatar_url}
              meUserId={user?.id ?? ''}
              // Revelado = "ver dónde era": lienzo DIARIO (satélite con etiquetas), que
              // sitúa el resultado sobre la foto aérea. El lienzo JUGAR (callejero
              // etiquetado) es el de colocar el pin, no el de revelar.
              preset="diario"
            />
          )}
        </div>

        {/* Leyenda bajo el mapa (issue #811): puesto + avatar + nombre + puntos +
            distancia + tiempo de respuesta — mismo componente/estilos que el
            detalle de un reto en el histórico del viaje (`ChallengeDetail`). */}
        <ChallengeBoard
          votes={allGuesses}
          myUserId={user?.id ?? null}
          className="lg-rise"
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
        />

        {/* Tarjeta de puntos (cifra + distancia + anillo). El coach-mark del reto
            ya no la ancla: resalta el MAPA de arriba (el tiro real); los puntos
            quedan a la vista debajo del mapa resaltado. */}
        <div>
          <Card padding="md" raised>
            <Stack gap={4}>
              {timedOut ? (
                <Stack gap={2}>
                  <strong className={styles.inlineIcon}>
                    <Icon icon={TimerOff} size={18} /> No diste a tiempo
                  </strong>
                  <span className={styles.status}>Se acabó el tiempo antes de colocar tu pin.</span>
                </Stack>
              ) : result ? (
                <Stack gap={4} align="center" className={styles.scoreReveal}>
                  {/* Celebración de gran tiro: destello + confeti sobrio + háptico.
                    Solo se monta si fue gran tiro; respeta reduced-motion (no pinta
                    ni vibra). Va absoluto sobre el bloque, sin capturar toques. */}
                  <RevealBurst active={result.points >= GREAT_SHOT} />
                  {/* Titular de celebración: icono custom + texto cálido si fue gran
                    tiro; diana neutra si fue un resultado normal. Entra el primero. */}
                  <span
                    className={`${styles.scoreEyebrow} ${styles.eyebrowIn} ${
                      result.points >= GREAT_SHOT ? styles.scoreEyebrowWin : ''
                    }`}
                  >
                    {result.points >= GREAT_SHOT ? (
                      <span className={styles.inlineIcon}>
                        <IconTrofeo size={16} />
                        ¡Gran tiro!
                      </span>
                    ) : (
                      <span className={styles.inlineIcon}>
                        <IconDiana size={16} />
                        Resultado
                      </span>
                    )}
                  </span>
                  {/* Anillo de acierto protagonista: % de la puntuación máxima, con
                    los puntos (count-up) gigantes en el centro. Coreografía del
                    revelado (#545): el anillo entra con un muelle y luego DIBUJA su
                    trazo solo (ScoreRing anima ~900ms al montar); el resto del bloque
                    (veredicto, distancia, acciones) entra EN ORDEN tras él, no de
                    golpe — ver los delays de .verdictIn/.distIn/.actionsIn más abajo. */}
                  {/* El anillo entra envuelto (no vía su propio `className`): ScoreRing
                    ya usa esa prop para `.high` (pulso infinito de gran tiro), que
                    competiría por la propiedad `animation` con la entrada. */}
                  <div className={styles.ringIn}>
                    <ScoreRing value={result.points} max={MAX_POINTS} size={168}>
                      <CountUp
                        className={styles.ringPoints}
                        value={result.points}
                        duration={1200}
                      />
                      <span className={styles.ringUnit}>puntos</span>
                    </ScoreRing>
                  </div>
                  <div className={styles.scoreText}>
                    <span className={`${styles.scoreLabel} ${styles.verdictIn}`}>
                      {distanceLabel(result.km)}
                    </span>
                    <span className={`${styles.resultDist} ${styles.distIn}`}>
                      a <strong className={styles.resultKm}>{fmtDist(result.km)}</strong> del
                      objetivo
                    </span>
                    {/* Tu puesto en el reto: pica a mejorar ("3º de 6"). Solo si se
                      pudo calcular con los votos del reto. */}
                    {rank && (
                      <span className={`${styles.rank} ${styles.distIn}`}>
                        <IconMedalla size={14} />
                        {rank.position}º de {rank.total}
                      </span>
                    )}
                    {/* Tiempo de respuesta + nota del factor de velocidad (issue
                      #628). La nota solo aparece cuando el factor confirmadamente
                      aplicó (nunca es una estimación del reloj local) y se aleja
                      de ×1,0 (sin desviación, no aporta nada nuevo que decir). */}
                    {speedInfo && (
                      <span className={`${styles.rank} ${styles.distIn}`}>
                        <Icon icon={Timer} size={14} />
                        Respondiste en {speedInfo.seconds}s
                        {speedInfo.factor != null && Math.round(speedInfo.factor * 10) !== 10 && (
                          <>
                            {' · ×'}
                            {speedInfo.factor.toLocaleString('es-ES', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}{' '}
                            por rapidez
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {saving && (
                    <Row gap={2} justify="center" className={styles.actionsIn}>
                      <Spinner size={16} />
                      <span className={styles.status}>Guardando tu voto…</span>
                    </Row>
                  )}
                </Stack>
              ) : (
                <span className={styles.status}>Revelado.</span>
              )}

              {/* Anti-trampa (issue #200): si mi voto salió de la app durante la
                jugada, aviso informativo (no penaliza puntos, solo deja constancia;
                en el marcador se ve junto a mi nombre). */}
              {iLeftApp && (
                <p className={styles.leftAppNotice} role="note">
                  <Icon icon={AlertTriangle} size={16} /> Saliste de la app durante la jugada
                </p>
              )}

              {/* "Guárdate / entra del todo" (issue #758): CTA OPCIONAL solo para el
                receptor ANÓNIMO — vincula su sesión a un email sin perder su voto
                ni su puesto (mismo uid). Saltable: no vincular no le quita nada de
                lo que ya jugó. No se ofrece a quien ya tiene cuenta permanente.
                Reencuadrado al beneficio + intensidad progresiva (issue #756):
                variant primaria a partir de la 2ª partida como anónimo. */}
              {isAnonymous ? (
                <Button
                  variant={intensifiedUpgrade ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => {
                    // Numerador del clic (issue #751): `upgrade_cta_shown` (la
                    // impresión del modal) lo emite AccountUpgradeModal al abrir.
                    track('upgrade_cta_clicked', {
                      origin: 'play_result',
                      group_id: groupId,
                      challenge_id: challenge.id,
                    })
                    setUpgradeOpen(true)
                  }}
                  className={styles.actionsIn}
                >
                  {upgradeCtaLabel}
                </Button>
              ) : (
                // Pre-prompt de push (issue #769): SOLO cuentas (el anónimo ve el
                // CTA de arriba) y solo con viaje (el aviso es "reto nuevo en tu
                // viaje" — un reto de práctica suelto, sin groupId, no aplica).
                groupId && <PushOptInPrompt surface="post_play" groupId={groupId} />
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
                  className={styles.actionsIn}
                >
                  <span className={styles.inlineIcon}>
                    <Icon icon={Share2} size={18} /> Compartir mi resultado
                  </span>
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
                <Stack gap={2} className={`${styles.secondary} ${styles.actionsIn}`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowStreetView((v) => !v)}
                    aria-expanded={showStreetView}
                  >
                    <span className={styles.inlineIcon}>
                      {showStreetView ? (
                        <>
                          <Icon icon={EyeOff} size={16} /> Ocultar
                        </>
                      ) : (
                        <>
                          <Icon icon={Eye} size={16} />{' '}
                          {hasStreetView ? 'Ver Street View' : 'Ver la foto'}
                        </>
                      )}
                    </span>
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
                <Row gap={2} justify="end" className={styles.actionsIn}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      // Al Marcador (no al Diario): venimos de jugar, lo esperable es
                      // ver la clasificación (#509).
                      location.hash = marcadorGroupHash(groupId)
                    }}
                  >
                    <span className={styles.inlineIcon}>
                      <IconTrofeo size={16} />
                      Ver clasificación
                      <Icon icon={ArrowRight} size={16} />
                    </span>
                  </Button>
                </Row>
              )}
            </Stack>
          </Card>
        </div>
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
            groupName={groupName ?? 'tu viaje'}
            challengeTitle={challenge.title}
            points={result.points}
            distanceKm={result.km}
            domain={shareDomain(buildChallengeLink(groupId, challenge.id))}
          />
        </div>
      )}

      {/* Guía del reto compartido (onboarding pieza 2/4, rediseño #891): UN
          coach-mark que señala el resultado real (sin taparlo) en cuanto se
          revela. "Siguiente" navega al VIAJE REAL y arranca allí el tour
          (Diario → Bitácora → Marcador); "Saltar" cae directo en el Marcador,
          sin registro. `!upgradeOpen` evita apilarla sobre el alta real. */}
      {isAnonymous && retoShare.active && !retoExplainDone && !upgradeOpen && (
        <RetoShareGuide
          resultRef={revealResultRef}
          onNext={() => {
            setRetoExplainDone(true)
            // Al viaje real con el tour del reto: `tour=reto` lo lee TripPage
            // (como el `tour=1` del ejemplo) y lo limpia del hash al terminar.
            // PlayChallenge se desmonta al cambiar el hash. `rc` (issue #895)
            // lleva el id de ESTE reto para que TripPage pueda volver al revelado
            // al terminar el tour; se usa `rc` (no `c`) para NO reabrir aquí
            // PlayChallenge y cortar el tour.
            if (groupId) {
              location.hash = `#g=${encodeURIComponent(groupId)}&tour=reto&rc=${encodeURIComponent(challenge.id)}`
            }
          }}
          onSkip={() => {
            setRetoExplainDone(true)
            // Saltar: directo al Marcador, sin tarjeta de registro.
            if (groupId) location.hash = marcadorGroupHash(groupId)
          }}
        />
      )}

      {isAnonymous && (
        <AccountUpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          origin="play_result"
          groupId={groupId}
          challengeId={challenge.id}
          groupName={groupLabel}
          points={upgradePoints}
          onUpgraded={() => {
            setUpgradeOpen(false)
            toast.show(`Guardado. Tus puntos de ${groupLabel} siguen siendo tuyos.`, {
              tone: 'success',
            })
          }}
        />
      )}
    </main>
  )
}
