import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { GameScenePreview } from './GameScenePreview'
import { PhotoDropzone } from './PhotoDropzone'
import { StepHeader } from './StepHeader'
import { MediaCard } from './MediaCard'
import {
  CameraIcon,
  CrosshairIcon,
  EyeIcon,
  HourglassIcon,
  PanoramaIcon,
  PinIcon,
  StopwatchIcon,
  TargetIcon,
} from './CreateIcons'
import type { LatLng } from '../../lib/geo'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, findPanoramaNear, type PanoramaMatch } from '../../lib/streetview'
import { uploadImage } from '../../lib/storage'
import { readGpsFromExif } from '../../lib/exif'
import {
  type Difficulty,
  DIFFICULTY_BLURB,
  DIFFICULTY_LABEL,
  difficultyFromMedia,
  isValidMedia,
} from '../../lib/difficulty'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { Badge, Button, Field, Input, Row, Spinner, Stack, useToast } from '../../ui'
import styles from './CreateChallenge.module.css'

interface Props {
  /** Grupo al que se añade el reto. El grupo ya existe (flujo grupo-primero). */
  groupId: string
  /** Vuelve atrás sin crear (cancelar). */
  onBack: () => void
  /** Reto creado: el grupo lo usa para volver a la lista y ofrecer su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// Radio (m) en el que buscamos Street View cerca de la foto cuando hay foto. El
// SV acompaña a la foto como contexto, no necesita caer en el punto exacto.
const SV_NEAR_RADIUS = 50

// De dónde salió la ubicación de la respuesta (para analítica).
type LocationSource = 'exif' | 'manual' | 'gps'

// Plazo del reto: DURACIÓN relativa al momento de crear, en minutos. El creador
// la elige con un slider sobre estas "paradas" (de express a largas);
// createChallenge la congela como instante absoluto (deadlineFromMinutes).
const DURATION_STOPS: { minutes: number; label: string }[] = [
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 480, label: '8 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
  { minutes: 2880, label: '48 h' },
]

// Parada por defecto: 4 h para responder.
const DEFAULT_DURATION_INDEX = DURATION_STOPS.findIndex((s) => s.minutes === 240)

// Hasta este umbral (incluido) la duración cuenta como "express".
const EXPRESS_MAX_MINUTES = 15

// Tiempo por jugada en segundos; null = sin límite. Default: 1 min.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

// Asistente en 3 pasos, en el orden que pidió el usuario:
//   1 · Lugar    → el MAPA (mi ubicación + tocar) y el Street View OPCIONAL.
//   2 · Foto     → la foto OPCIONAL (la imagen que verán y deben situar).
//   3 · Resumen  → nombre + tiempos + previa REAL + crear.
// La dificultad NO se elige; se DERIVA de los medios y se muestra en vivo.
type Step = 'place' | 'photo' | 'summary'

const STEP_ORDER: Step[] = ['place', 'photo', 'summary']

// Cabecera editorial de cada paso: eyebrow (la fase), título serif (la pregunta),
// una frase de contexto y un icono propio. El paso 1 deja claro que el punto es
// la RESPUESTA OCULTA que los demás deberán adivinar (no un sitio que se ve).
const STEP_META: Record<Step, { eyebrow: string; title: string; hint: string }> = {
  place: {
    eyebrow: 'El lugar',
    title: '¿Dónde estás?',
    hint: 'Marca el punto en el mapa: quedará oculto y los demás tendrán que adivinarlo. Si quieres, deja que exploren tu calle en Street View.',
  },
  photo: {
    eyebrow: 'La pista',
    title: '¿Qué verán?',
    hint: 'Añade la foto que mostrarás. Es lo que tendrán para situarte en el mapa.',
  },
  summary: {
    eyebrow: 'Últimos detalles',
    title: 'Casi listo',
    hint: 'Ponle nombre y elige los tiempos. Luego puedes ver cómo quedará antes de lanzarlo.',
  },
}

const STEP_ICONS: Record<Step, ReactElement> = {
  place: <TargetIcon />,
  photo: <CameraIcon />,
  summary: <StopwatchIcon />,
}

export function CreateChallenge({ groupId, onBack, onCreated }: Props) {
  const [step, setStep] = useState<Step>('place')
  // En «Resumen» la previa REAL (pantalla de juego a pantalla completa) se abre
  // bajo demanda: el creador rellena nombre/tiempos y, si quiere, la inspecciona.
  const [previewOpen, setPreviewOpen] = useState(false)

  const [title, setTitle] = useState('')
  // Respuesta del reto (lat/lng oculto). Sale de la foto (EXIF), del mapa, de la
  // búsqueda o del GPS.
  const [point, setPoint] = useState<LatLng | null>(null)
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // ¿El creador quiere incluir Street View? Toggle explícito. Al activarlo
  // buscamos panorama cerca del punto; al desactivarlo lo quitamos.
  const [wantsStreetView, setWantsStreetView] = useState(false)
  // Panorama de Street View encajado. Cuando hay foto, es contexto cercano; sin
  // foto, ES la escena. `wantsStreetView` sin `pano` = activo pero aún sin encaje.
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  // Cuando hay foto avisamos a qué distancia cayó el SV para que el creador
  // confirme usarlo. Mientras está pendiente de confirmar, no fijamos `pano`.
  const [svPrompt, setSvPrompt] = useState<{ pano: PanoramaMatch; distanceMeters: number } | null>(
    null,
  )
  // POV con el que arrancarán los jugadores; el creador puede girar la previa.
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })
  // Candados de exploración del Street View (dificultad). AMBOS permitidos por
  // defecto (toggles ON); el creador "quita" libertad. Guardamos como permiso
  // (allowMove/allowRotate) y lo traducimos a candado (lock = !allow) al crear. #187.
  const [allowMove, setAllowMove] = useState(true)
  const [allowRotate, setAllowRotate] = useState(true)
  // Duración del reto como índice en DURATION_STOPS; 4 h por defecto.
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(60)
  // Foto del reto (se sube SIN EXIF). Con SV va como pista (visible al jugar,
  // junto al panorama); sin SV ES la escena. `photoPreview` es un object URL que
  // revocamos al cambiar para no fugar memoria.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [readingExif, setReadingExif] = useState(false)
  const toast = useToast()
  const { user } = useSession()

  // Token para descartar respuestas de búsquedas de panorama obsoletas: si el
  // creador mueve el pin mientras una búsqueda está en curso, ignoramos la vieja.
  const panoSearchToken = useRef(0)

  // Medios reales del reto y dificultad derivada de ellos (fuente de verdad).
  const hasPhoto = Boolean(photoFile)
  const hasStreetView = Boolean(pano)
  const realDifficulty: Difficulty | null = difficultyFromMedia({ hasPhoto, hasStreetView })

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  // Adjuntar foto: leemos el GPS del File ORIGINAL (antes de que uploadImage lo
  // estripe). Con GPS → es la respuesta (pin ajustable); sin GPS → pedimos
  // colocarla en el mapa a mano.
  async function onPhotoChange(file: File | null) {
    pickPhoto(file)
    if (!file) return
    setReadingExif(true)
    try {
      const gps = await readGpsFromExif(file)
      if (gps) {
        setPoint(gps)
        setFlyTo(gps)
        setLocationSource('exif')
        toast.show('Leímos dónde es por la foto. Ajusta el pin si hace falta.', { tone: 'success' })
      } else {
        // Sin GPS: NO bloqueamos. El creador coloca el punto en el mapa.
        toast.show('Esta foto no dice dónde es. Colócala en el mapa.', { tone: 'neutral' })
      }
    } finally {
      setReadingExif(false)
    }
  }

  // Colocar/ajustar el punto en el mapa (manual). Fija (o ajusta) la respuesta.
  function pickPoint(p: LatLng) {
    setPoint(p)
    // El origen es "manual" salvo que ya viniera de EXIF y solo lo estén ajustando:
    // mantenemos 'exif' como origen primario (ajustar el pin no cambia que la pista
    // de ubicación vino de la foto).
    if (locationSource == null) setLocationSource('manual')
  }

  // Buscar Street View al activarlo o al mover el punto con SV activo:
  //  · Con foto: el SV es contexto a ≤50 m → si cae cerca pedimos confirmar; si no
  //    hay, avisamos (el reto seguirá como solo foto = Difícil).
  //  · Sin foto: el SV ES la escena → exigimos cobertura en el punto exacto.
  useEffect(() => {
    if (!point || !wantsStreetView) return
    const token = ++panoSearchToken.current
    void (async () => {
      // Reset dentro del async (no en el cuerpo del efecto) para no disparar
      // renders en cascada síncronos al fijar el punto.
      setSvPrompt(null)
      setPano(null)
      setCheckingPano(true)
      try {
        if (hasPhoto) {
          const near = await findPanoramaNear(point.lat, point.lng, SV_NEAR_RADIUS)
          if (token !== panoSearchToken.current) return
          if (!near) {
            // Sin SV cerca: el reto será Difícil (solo foto). No bloqueamos.
            toast.show(
              'No hay Street View cerca de la foto. Sin él, el reto será 🔴 Difícil (solo foto).',
              { tone: 'neutral' },
            )
            return
          }
          // Pedimos confirmación del SV cercano antes de adoptarlo (puede estar a
          // unos metros de la foto: es correcto, pero el creador decide).
          setSvPrompt({ pano: near, distanceMeters: near.distanceMeters })
        } else {
          const match = await findPanorama(point.lat, point.lng)
          if (token !== panoSearchToken.current) return
          if (!match) {
            toast.show('Aquí no hay Street View; mueve el pin a un punto con cobertura.', {
              tone: 'danger',
            })
            return
          }
          setPano(match)
          setPov({ heading: 0, pitch: 0 })
        }
      } finally {
        if (token === panoSearchToken.current) setCheckingPano(false)
      }
    })()
    // toast es estable (contexto); reaccionamos al punto, al toggle de SV y a si
    // hay foto (cambia el criterio de búsqueda: cercano vs. exacto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, wantsStreetView, hasPhoto])

  // Confirmar el Street View cercano propuesto (con foto): lo adoptamos.
  function acceptSv() {
    if (!svPrompt) return
    setPano(svPrompt.pano)
    setPov({ heading: 0, pitch: 0 })
    setSvPrompt(null)
  }

  // Rechazar el SV propuesto: lo descartamos. El creador puede recolocar el punto
  // (otra búsqueda) o desactivar el SV → el reto será solo foto (Difícil).
  function rejectSv() {
    setSvPrompt(null)
    setPano(null)
  }

  // Desactivar el Street View: lo quitamos como medio. La dificultad se recalcula
  // sola (con foto → Difícil; sin foto el creador tendrá que añadir algún medio).
  function toggleStreetView() {
    setWantsStreetView((on) => {
      const next = !on
      if (!next) {
        setPano(null)
        setSvPrompt(null)
        setAllowMove(true)
        setAllowRotate(true)
      }
      return next
    })
  }

  // "Mi ubicación": pide el GPS y, al obtenerlo, fija el punto y vuela el mapa
  // ahí. El spinner se apaga SIEMPRE, también en error, y diferenciamos permiso
  // denegado / timeout / no disponible.
  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización. Toca el mapa.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPoint(p)
        setFlyTo(p)
        setLocationSource('gps')
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        // GeolocationPositionError: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
        // 3 = TIMEOUT. Mensaje claro por caso; nunca dejamos al usuario colgado.
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Diste «no» al permiso de ubicación. Actívalo en el navegador o toca el mapa.'
            : err.code === err.TIMEOUT
              ? 'Tardó demasiado en localizarte. Reinténtalo o toca el mapa.'
              : 'No se pudo obtener tu ubicación. Toca el mapa.'
        toast.show(message, { tone: 'danger' })
      },
      // maximumAge: aceptamos una posición cacheada de hasta 30 s para responder
      // rápido (evita el "no pasa nada" cuando el fix de alta precisión tarda).
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Gating por paso: cada pantalla decide si se puede avanzar.
  const mediaValid = isValidMedia({ hasPhoto, hasStreetView })
  // Paso «Lugar»: hay punto fijado (el Street View es OPCIONAL aquí) y ninguna
  // búsqueda de panorama pendiente (svPrompt sin decidir / búsqueda en curso) ni
  // GPS en vuelo. La foto y la validez de medios se resuelven en pasos siguientes.
  const canLeavePlace = point != null && !locating && !svPrompt && !checkingPano
  // Paso «Foto»: nada obligatorio (la foto es opcional). Evitamos avanzar mientras
  // se procesa la foto: leyendo el GPS del EXIF (no dejar el punto a medio ajustar)
  // o buscando/confirmando un Street View cercano disparado por ese GPS.
  const canLeavePhoto = !readingExif && !checkingPano && !svPrompt

  // Listo para crear (en «Resumen»): hay punto, título, al menos un medio (foto o
  // Street View) y sin confirmaciones de panorama pendientes.
  const readyToCreate =
    point != null &&
    title.trim().length > 0 &&
    mediaValid &&
    realDifficulty != null &&
    !svPrompt &&
    !checkingPano

  function goNext() {
    // Si la foto aún se está procesando (EXIF/Street View), no avanzamos y lo
    // decimos con un toast (como en «Añadir recuerdo»), en vez de un botón muerto.
    if (step === 'photo' && !canLeavePhoto) {
      toast.show('Analizando foto…', { tone: 'neutral' })
      return
    }
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }

  // El botón "Anterior": en el primer paso cancela (sale del flujo); entre pasos
  // retrocede uno. Navegar NO resetea nada: todo el estado vive en este padre.
  function goBack() {
    const i = STEP_ORDER.indexOf(step)
    if (i === 0) onBack()
    else setStep(STEP_ORDER[i - 1])
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (!point || !realDifficulty) {
      toast.show('Falta la ubicación del reto.', { tone: 'danger' })
      return
    }
    if (!isValidMedia({ hasPhoto, hasStreetView })) {
      toast.show('Un reto debe tener al menos foto o Street View.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      // Foto opcional: la subimos comprimida y SIN EXIF. El GPS ya lo leímos del
      // File original al adjuntarla; aquí solo sube la versión estripada.
      let imagePath: string | undefined
      if (photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Guardando el reto…')
      // La respuesta del reto es SIEMPRE `point` (la foto/manual mandan). El
      // panorama (cuando lo hay) es contexto explorable, aunque caiga a unos
      // metros de la respuesta: es correcto.
      const { challenge } = await createChallenge({
        title: title.trim(),
        lat: point.lat,
        lng: point.lng,
        createdBy: user.id,
        groupId,
        svPanoId: pano?.panoId,
        svHeading: pano ? pov.heading : undefined,
        svPitch: pano ? pov.pitch : undefined,
        // Candados solo aplican si hay panorama. El toggle es "permitir"; el
        // candado es lo contrario (lock = !allow). Sin SV, ambos quedan false.
        svLockMove: pano ? !allowMove : undefined,
        svLockRotate: pano ? !allowRotate : undefined,
        deadlineAt: deadlineFromMinutes(DURATION_STOPS[durationIndex].minutes),
        guessSeconds,
        imagePath,
        // Con Street View la foto es pista (acompaña al panorama).
        photoIsHint: true,
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: Boolean(imagePath),
        has_streetview: Boolean(pano),
        guess_seconds: guessSeconds,
        photo_is_hint: imagePath ? true : null,
        duration_hours: DURATION_STOPS[durationIndex].minutes / 60,
        // La dificultad ya no se elige: es la derivada de los medios.
        difficulty: realDifficulty,
        location_source: locationSource ?? 'manual',
      })
      onCreated(challenge)
    } catch (err) {
      // Visibilidad del fallo completo de crear reto (subida/decodificación de
      // foto, RPC…) en Sentry, aunque la UI lo gestione con un toast.
      reportError(err, { area: 'create_challenge' })
      // describeError saca el mensaje REAL de errores de Supabase/PostgREST (que no
      // son `Error`): sin esto, el toast mostraba "[object Object]".
      const msg = describeError(err)
      setStatus(null)
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo crear el reto: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  // PREVIA REAL = PANTALLA DE JUEGO (#234). Desde «Resumen» se abre la MISMA
  // escena inmersiva que verán los jugadores (a pantalla completa, fuera del
  // layout de página), con los datos del BORRADOR. Es una previa: NO vota ni
  // guarda; las acciones (Volver / Crear reto) flotan sobre la escena.
  if (step === 'summary' && previewOpen && realDifficulty && point) {
    return (
      <>
        <GameScenePreview
          title={title}
          panoId={pano?.panoId ?? null}
          pov={pov}
          lockMove={!allowMove}
          lockRotate={!allowRotate}
          point={point}
          photoUrl={photoPreview}
          guessSeconds={guessSeconds}
          onBack={() => setPreviewOpen(false)}
        />
        {/* Acciones de la previa, flotando sobre la escena (por encima del overlay). */}
        <div className={styles.previewActions}>
          {status && (
            <Row gap={2} className={styles.previewStatus}>
              <Spinner size={16} />
              <span>{status}</span>
            </Row>
          )}
          <Row gap={3} className={styles.nav}>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              ← Volver a editar
            </Button>
            <Button
              size="lg"
              className={styles.navNext}
              loading={busy}
              disabled={!readyToCreate}
              onClick={() => void save()}
            >
              Lanzar reto
            </Button>
          </Row>
        </div>
      </>
    )
  }

  const meta = STEP_META[step]

  return (
    <main className="lg-page">
      <Stack gap={5}>
        <StepHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          hint={meta.hint}
          icon={STEP_ICONS[step]}
          current={STEP_ORDER.indexOf(step) + 1}
          total={STEP_ORDER.length}
          onBack={goBack}
        />

        {/* PASO 1 — LUGAR: el MAPA (GPS + tocar el mapa) marca el punto (la
            respuesta) y, DEBAJO, el Street View OPCIONAL. La foto NO está aquí
            (va en el paso 2). El SV es opcional: con punto basta para avanzar. */}
        {step === 'place' && (
          <Stack gap={5}>
            {/* MAPA arriba: GPS + tocar el mapa marcan el punto (la respuesta).
                El mapa es el protagonista; el chip de estado flota a su pie. */}
            <div className={styles.mapBlock}>
              <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPoint} />

              {/* Chip de estado sobre el pie del mapa: marcado (acento) o pista. */}
              <div className={styles.mapStatus}>
                {point ? (
                  <span className={styles.mapStatusMarked}>
                    <TargetIcon size={16} />
                    <span>Sitio marcado</span>
                    <span className={styles.coords}>
                      {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                    </span>
                  </span>
                ) : (
                  <span className={styles.mapStatusHint}>
                    <PinIcon size={16} />
                    Toca el mapa para marcar el punto
                  </span>
                )}
              </div>

              {/* «Mi ubicación» flotando sobre el mapa, no como botón gris aparte. */}
              <button
                type="button"
                className={styles.gpsButton}
                onClick={useGps}
                disabled={locating}
                aria-label="Usar mi ubicación actual"
              >
                {locating ? <Spinner size={18} /> : <CrosshairIcon size={20} />}
              </button>
            </div>

            {/* STREET VIEW (DEBAJO del mapa): OPCIONAL. Sin foto en este paso, el
                SV ES la escena → exigimos cobertura en el punto exacto. */}
            <MediaCard
              icon={<PanoramaIcon />}
              title="Street View"
              done={hasStreetView}
              doneLabel="Añadido"
            >
              <Stack gap={3}>
                <span className={styles.hint}>
                  Deja que exploren tu calle en 360°. El reto será más fácil.
                </span>
                <Button
                  variant={wantsStreetView ? 'primary' : 'secondary'}
                  fullWidth
                  disabled={!point}
                  aria-pressed={wantsStreetView}
                  onClick={toggleStreetView}
                >
                  {wantsStreetView ? '✓ Street View activado' : 'Añadir Street View'}
                </Button>
                {!point && <span className={styles.hint}>Marca antes el punto en el mapa.</span>}

                {checkingPano && (
                  <Row gap={2} className={styles.status}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </Row>
                )}

                {/* Previa del panorama (ya confirmado). */}
                {pano && (
                  <StreetViewPreview
                    panoId={pano.panoId}
                    heading={pov.heading}
                    pitch={pov.pitch}
                    onPovChange={setPov}
                  />
                )}

                {/* CANDADOS DE EXPLORACIÓN (#187): opciones avanzadas, solo con
                    panorama. Ambos permitidos por defecto; desactívalos para
                    hacer el reto más difícil. */}
                {pano && (
                  <details className={styles.advanced}>
                    <summary className={styles.advancedSummary}>
                      Ajustar dificultad del Street View
                    </summary>
                    <Stack gap={3} className={styles.advancedBody}>
                      <Row gap={2} align="center" wrap>
                        <Button
                          variant={allowMove ? 'primary' : 'secondary'}
                          size="sm"
                          aria-pressed={allowMove}
                          onClick={() => setAllowMove((v) => !v)}
                        >
                          {allowMove ? '✓ ' : ''}Permitir moverse
                        </Button>
                        <span className={styles.hint}>
                          {allowMove ? 'Pueden avanzar por la calle.' : 'No pueden avanzar.'}
                        </span>
                      </Row>
                      <Row gap={2} align="center" wrap>
                        <Button
                          variant={allowRotate ? 'primary' : 'secondary'}
                          size="sm"
                          aria-pressed={allowRotate}
                          onClick={() => setAllowRotate((v) => !v)}
                        >
                          {allowRotate ? '✓ ' : ''}Permitir mirar alrededor
                        </Button>
                        <span className={styles.hint}>
                          {allowRotate ? 'Pueden girar la cámara.' : 'Vista fija.'}
                        </span>
                      </Row>
                    </Stack>
                  </details>
                )}
              </Stack>
            </MediaCard>

            {/* Paso 1: solo «Continuar» (cancelar se hace con el «← Atrás» de la
                cabecera; no hay «Atrás» en el pie de la primera pantalla). */}
            <Row gap={3} className={styles.nav}>
              <Button
                size="lg"
                className={styles.navNext}
                disabled={!canLeavePlace}
                onClick={goNext}
              >
                Continuar →
              </Button>
            </Row>
          </Stack>
        )}

        {/* PASO 2 — FOTO: la foto OPCIONAL. El lugar ya quedó fijado en el paso 1;
            aquí solo añades la imagen que verán y deben situar. Si la foto trae
            GPS, ofrecemos ajustar el punto, pero no es obligatorio. */}
        {step === 'photo' && (
          <Stack gap={5}>
            <MediaCard icon={<CameraIcon />} title="Foto" done={hasPhoto} doneLabel="Añadida">
              <Stack gap={3}>
                {/* El usuario pidió EXPLÍCITAMENTE explicar la foto (excepción al
                    "mínimo texto"): es la imagen que verán y tendrán que situar. */}
                <span className={styles.hint}>
                  Es la imagen que verán y tendrán que situar en el mapa.
                </span>
                <PhotoDropzone
                  preview={photoPreview}
                  loading={readingExif}
                  onPick={(file) => void onPhotoChange(file)}
                  onClear={() => pickPhoto(null)}
                />

                {checkingPano && (
                  <Row gap={2} className={styles.status}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </Row>
                )}

                {/* Si la foto trae GPS movió el punto y hay Street View activo,
                    puede haber un panorama nuevo cerca: confirmar usarlo o no. */}
                {svPrompt && (
                  <Stack gap={2} className={styles.svPrompt}>
                    <span>
                      Encontramos Street View a {svPrompt.distanceMeters} m de tu foto. ¿Lo
                      añadimos?
                    </span>
                    <Row gap={2} wrap>
                      <Button size="sm" onClick={acceptSv}>
                        Sí, usarlo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={rejectSv}>
                        No, gracias
                      </Button>
                    </Row>
                  </Stack>
                )}
              </Stack>
            </MediaCard>

            {/* Dificultad en vivo según la combinación de medios elegida hasta aquí. */}
            {realDifficulty && (
              <div className={styles.difficultyStrip}>
                <span className={styles.difficultyLead}>Dificultad</span>
                <Badge tone="accent">{DIFFICULTY_LABEL[realDifficulty]}</Badge>
                <span className={styles.hint}>{DIFFICULTY_BLURB[realDifficulty]}</span>
              </div>
            )}

            <Row gap={3} className={styles.nav}>
              <Button variant="ghost" onClick={goBack}>
                ← Atrás
              </Button>
              {/* No deshabilitamos mientras se procesa la foto: goNext intercepta y
                  muestra «Analizando foto…» en vez de dejar un botón muerto. */}
              <Button size="lg" className={styles.navNext} onClick={goNext}>
                Continuar →
              </Button>
            </Row>
          </Stack>
        )}

        {/* PASO 3 — RESUMEN: nombre (obligatorio), duración (4 h) y tiempo por
            jugada (1 min); dificultad en vivo, aviso si faltan medios, previa
            REAL bajo demanda y «Crear reto». */}
        {step === 'summary' && (
          <Stack gap={5}>
            <Field label="Nombre del reto">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  placeholder="p. ej. ¿Dónde estoy?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>

            <Field label="Plazo para responder">
              {(fieldProps) => {
                const stop = DURATION_STOPS[durationIndex]
                const isExpress = stop.minutes <= EXPRESS_MAX_MINUTES
                return (
                  <Stack gap={2}>
                    <Row gap={2} className={styles.durationValue}>
                      <span className={styles.durationIcon} aria-hidden>
                        <StopwatchIcon size={22} />
                      </span>
                      <span className={styles.durationLabel}>{stop.label}</span>
                      {isExpress && (
                        <span className={styles.expressPill}>
                          <HourglassIcon size={13} /> Express
                        </span>
                      )}
                    </Row>
                    <input
                      {...fieldProps}
                      type="range"
                      className={styles.durationSlider}
                      min={0}
                      max={DURATION_STOPS.length - 1}
                      step={1}
                      value={durationIndex}
                      onChange={(e) => setDurationIndex(Number(e.target.value))}
                      aria-label="Plazo para responder"
                      aria-valuetext={stop.label}
                    />
                    <Row gap={2} justify="between" className={styles.durationScale}>
                      <span>{DURATION_STOPS[0].label}</span>
                      <span>{DURATION_STOPS[DURATION_STOPS.length - 1].label}</span>
                    </Row>
                  </Stack>
                )
              }}
            </Field>

            <Field label="Tiempo por jugada">
              {() => (
                <Row gap={2} wrap>
                  {GUESS_OPTIONS.map((opt) => (
                    <Button
                      key={opt.label}
                      variant={guessSeconds === opt.value ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={guessSeconds === opt.value}
                      onClick={() => setGuessSeconds(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </Row>
              )}
            </Field>

            {/* Dificultad en vivo (badge) o aviso si no hay ningún medio: un reto
                debe tener al menos foto o Street View. */}
            {realDifficulty ? (
              <div className={styles.difficultyStrip}>
                <span className={styles.difficultyLead}>Dificultad</span>
                <Badge tone="accent">{DIFFICULTY_LABEL[realDifficulty]}</Badge>
                <span className={styles.hint}>{DIFFICULTY_BLURB[realDifficulty]}</span>
              </div>
            ) : (
              <div className={styles.mediaWarning}>
                <span aria-hidden>⚠️</span>
                <span>
                  Falta la pista: vuelve atrás y añade una foto o un Street View. Sin ninguna no se
                  puede lanzar el reto.
                </span>
              </div>
            )}

            {/* Previa REAL (pantalla de juego) bajo demanda: solo cuando hay punto
                y medios válidos (si no, no hay nada que enseñar). */}
            <Button
              variant="secondary"
              fullWidth
              disabled={point == null || !mediaValid}
              onClick={() => setPreviewOpen(true)}
              aria-label="Ver cómo se vería al jugar (pantalla completa)"
            >
              <span className={styles.previewBtnLabel}>
                <EyeIcon size={18} /> Ver cómo quedará
              </span>
            </Button>

            <Row gap={3} className={styles.nav}>
              <Button variant="ghost" onClick={goBack}>
                ← Atrás
              </Button>
              <Button
                size="lg"
                className={styles.navNext}
                loading={busy}
                disabled={!readyToCreate}
                onClick={() => void save()}
              >
                Lanzar reto
              </Button>
            </Row>
          </Stack>
        )}
      </Stack>
    </main>
  )
}
