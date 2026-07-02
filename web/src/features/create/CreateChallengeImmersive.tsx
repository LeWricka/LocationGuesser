import { useEffect, useRef, useState } from 'react'
import { ImmersiveMap } from './ImmersiveMap'
import { ImmersiveSheet } from './ImmersiveSheet'
import { GameScenePreview } from './GameScenePreview'
import { PhotoDropzone } from './PhotoDropzone'
import { StreetViewPreview } from './StreetViewPreview'
import {
  CameraIcon,
  CheckIcon,
  CrosshairIcon,
  EyeIcon,
  PanoramaIcon,
  StopwatchIcon,
  TargetIcon,
} from './CreateIcons'
import type { LatLng, ScoreScale } from '../../lib/geo'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, findPanoramaNear, type PanoramaMatch } from '../../lib/streetview'
import { uploadImage } from '../../lib/storage'
import { readGpsFromExif } from '../../lib/exif'
import { type Difficulty, difficultyFromMedia, isValidMedia } from '../../lib/difficulty'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { AlertTriangle } from 'lucide-react'
import { AppHeader, Button, Icon, Spinner, useToast } from '../../ui'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import styles from './CreateChallengeImmersive.module.css'

/**
 * Pre-relleno del reto cuando NACE de un recuerdo (uno de los dos orígenes): el
 * lugar y la foto del recuerdo se traen ya puestos. `imagePath` es la foto YA
 * SUBIDA del recuerdo: si está, NO se vuelve a subir (se reutiliza tal cual); su
 * vista previa es `photoUrl` (URL firmada). Desde el FAB "Reto" no se pasa nada.
 */
export interface ChallengePrefill {
  /** Lugar del recuerdo → respuesta oculta del reto (o null si el recuerdo no tenía). */
  point: LatLng | null
  /** Path en Storage de la foto del recuerdo, ya subida (se reutiliza, no se re-sube). */
  imagePath: string | null
  /** URL firmada de la foto del recuerdo para la vista previa (o null). */
  photoUrl: string | null
  /** Título del recuerdo, como propuesta de nombre del reto. */
  title: string
}

interface Props {
  /** Grupo (el viaje) al que se añade el reto. Ya existe (flujo grupo-primero). */
  groupId: string
  /** Nombre del viaje para la píldora de cabecera (contexto). */
  groupName?: string | null
  /** Pre-relleno cuando el reto nace de un recuerdo (foto + lugar). */
  prefill?: ChallengePrefill
  /** Sale del flujo sin crear (cancelar). */
  onBack: () => void
  /** Reto creado: el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// Radio (m) en el que buscamos Street View cerca de la foto cuando hay foto. El
// SV acompaña a la foto como contexto, no necesita caer en el punto exacto.
const SV_NEAR_RADIUS = 50

// De dónde salió la ubicación oculta (para analítica).
type LocationSource = 'exif' | 'manual' | 'gps'

// Plazo del reto: DURACIÓN relativa en minutos, elegida con segmentos (como la
// maqueta). createChallenge la congela como instante absoluto.
const DEADLINE_OPTIONS: { minutes: number; label: string; review: string }[] = [
  { minutes: 60, label: '1 h', review: 'Cierra en 1 h' },
  { minutes: 240, label: '4 h', review: 'Cierra en 4 h' },
  { minutes: 720, label: 'Hoy', review: 'Cierra hoy' },
  { minutes: 4320, label: '3 días', review: 'Cierra en 3 días' },
]
const DEFAULT_DEADLINE_INDEX = 1 // 4 h

// Tiempo por jugada en segundos; null = sin límite (como la maqueta: 15/30/60/Libre).
const GUESS_OPTIONS: { value: number | null; label: string; review: string }[] = [
  { value: 15, label: '15 s', review: '15 s por intento' },
  { value: 30, label: '30 s', review: '30 s por intento' },
  { value: 60, label: '60 s', review: '60 s por intento' },
  { value: null, label: 'Libre', review: 'sin límite por intento' },
]
const DEFAULT_GUESS_INDEX = 1 // 30 s

// PRECISIÓN del reto: calibra cómo de estricto es el conteo de distancia (0028).
// 'mundo' (default) = scoring de siempre; cuanto más acotado, más estricto.
const PRECISION_OPTIONS: { value: ScoreScale; label: string; review: string }[] = [
  { value: 'mundo', label: 'Mundo', review: 'precisión: el país lejano' },
  { value: 'pais', label: 'País', review: 'precisión: el país' },
  { value: 'ciudad', label: 'Ciudad', review: 'precisión: la ciudad' },
  { value: 'barrio', label: 'Barrio', review: 'precisión: casi la calle' },
]
const DEFAULT_PRECISION_INDEX = 0 // mundo

// Etapas de la hoja: 0=lugar (mapa + Street View) · 1=foto · 2=detalles · 3=resumen.
type Stage = 0 | 1 | 2 | 3
const TOTAL_STAGES = 4
// Alturas (px) de la hoja por etapa. En la etapa de LUGAR (0) la hoja es baja para
// dejar el mapa a sangre como protagonista; crece al haber punto (aparece el Street
// View) y aún más con la previa de SV. En las demás etapas el mapa se RECOGE a una
// tarjeta-preview compacta arriba (ya no es fondo a sangre), así que la hoja sube y
// ocupa casi toda la pantalla, con el contenido de cada paso.
const STAGE_HEIGHTS: Record<Stage, number> = { 0: 140, 1: 560, 2: 620, 3: 580 }
const STAGE0_WITH_POINT = 300
const STAGE0_WITH_PANO = 520

export function CreateChallengeImmersive({
  groupId,
  groupName,
  prefill,
  onBack,
  onCreated,
}: Props) {
  // Origen recuerdo: si trae lugar, arrancamos ya con el pin puesto (saltamos la
  // etapa de "marca el mapa", que pasa a ser 1 = foto). Origen FAB: empieza en 0.
  const [stage, setStage] = useState<Stage>(prefill?.point ? 1 : 0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  // Reto recién creado: en vez de saltar directo a jugar, mostramos la hoja
  // "comparte el enlace" para que el creador lo reparta EN CALIENTE (#330).
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)

  const [title, setTitle] = useState(prefill?.title ?? '')
  // Respuesta del reto (lat/lng oculto): de la foto (EXIF), del mapa o del GPS.
  // Del recuerdo de origen viene ya el lugar (su `place_*`).
  const [point, setPoint] = useState<LatLng | null>(prefill?.point ?? null)
  const [locationSource, setLocationSource] = useState<LocationSource | null>(
    prefill?.point ? 'manual' : null,
  )
  const [flyTo, setFlyTo] = useState<LatLng | null>(prefill?.point ?? null)
  // El usuario ya exploró el mapa (zoom/arrastre): ocultamos la guía central para
  // que no se confunda con un pin ya puesto (#388).
  const [mapInteracted, setMapInteracted] = useState(false)
  const [locating, setLocating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Foto YA SUBIDA del recuerdo de origen (path en Storage): si está, la
  // reutilizamos al crear el reto en vez de re-subir. La vista previa es su URL firmada.
  const [prefilledImagePath] = useState<string | null>(prefill?.imagePath ?? null)

  // ¿Incluir Street View? Toggle explícito; al activarlo buscamos panorama cerca.
  const [wantsStreetView, setWantsStreetView] = useState(false)
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  const [svPrompt, setSvPrompt] = useState<{ pano: PanoramaMatch; distanceMeters: number } | null>(
    null,
  )
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)
  const [precisionIndex, setPrecisionIndex] = useState(DEFAULT_PRECISION_INDEX)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  // Vista previa: una nueva foto elegida (object URL) o, del recuerdo de origen, su
  // URL firmada. Si el usuario elige otra foto, `pickPhoto` sustituye el preview.
  const [photoPreview, setPhotoPreview] = useState<string | null>(prefill?.photoUrl ?? null)
  const [readingExif, setReadingExif] = useState(false)

  const toast = useToast()
  const { user } = useSession()

  // Token para descartar respuestas de búsquedas de panorama obsoletas.
  const panoSearchToken = useRef(0)

  // Hay foto si el usuario eligió una nueva O si reutilizamos la del recuerdo de
  // origen (ya subida). Mientras no se quite el preview, la del recuerdo cuenta.
  const reusesPrefilledPhoto =
    prefilledImagePath != null && photoFile == null && photoPreview != null
  const hasPhoto = Boolean(photoFile) || reusesPrefilledPhoto
  const hasStreetView = Boolean(pano)
  const realDifficulty: Difficulty | null = difficultyFromMedia({ hasPhoto, hasStreetView })
  const mediaValid = isValidMedia({ hasPhoto, hasStreetView })
  const guessSeconds = GUESS_OPTIONS[guessIndex].value

  // Limpia el object URL de la foto al desmontar (no fugar memoria). Solo revocamos
  // los `blob:` que creamos nosotros; la URL firmada del recuerdo de origen (https)
  // no es revocable.
  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  // Adjuntar foto: leemos el GPS del File ORIGINAL (antes de que uploadImage lo
  // estripe). Con GPS → fija la respuesta y vuela el mapa; sin GPS → a marcar a mano.
  async function onPhotoChange(file: File | null) {
    pickPhoto(file)
    if (!file) return
    setReadingExif(true)
    try {
      const gps = await readGpsFromExif(file)
      if (gps) {
        setPoint(gps)
        setFlyTo(gps)
        setLocationSource((prev) => prev ?? 'exif')
        toast.show('Leímos dónde es por la foto. Ajusta el pin si hace falta.', { tone: 'success' })
      } else {
        toast.show('Esta foto no dice dónde es. Toca el mapa para marcarlo.', { tone: 'neutral' })
      }
    } finally {
      setReadingExif(false)
    }
  }

  // Tocar el mapa marca/ajusta el punto y lo vuela al centro.
  function pickPoint(p: LatLng) {
    setPoint(p)
    setFlyTo(p)
    if (locationSource == null) setLocationSource('manual')
    // NO auto-avanzar de etapa: el Street View vive en la etapa de lugar, junto al
    // punto (#388). Antes esto saltaba a "foto" tras 620 ms, así que el bloque
    // «Añadir Street View» solo parpadeaba y quedaba inalcanzable (#453). La hoja
    // crece en el sitio (STAGE0_WITH_POINT) y el usuario avanza con el CTA.
  }

  // Buscar Street View al activarlo o al mover el punto con SV activo. Con foto:
  // contexto a ≤50 m (pedimos confirmar). Sin foto: el SV ES la escena (punto exacto).
  useEffect(() => {
    if (!point || !wantsStreetView) return
    const token = ++panoSearchToken.current
    void (async () => {
      setSvPrompt(null)
      setPano(null)
      setCheckingPano(true)
      try {
        if (hasPhoto) {
          const near = await findPanoramaNear(point.lat, point.lng, SV_NEAR_RADIUS)
          if (token !== panoSearchToken.current) return
          if (!near) {
            toast.show('No hay Street View cerca de la foto. El reto será solo foto.', {
              tone: 'neutral',
            })
            return
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, wantsStreetView, hasPhoto])

  function acceptSv() {
    if (!svPrompt) return
    setPano(svPrompt.pano)
    setPov({ heading: 0, pitch: 0 })
    setSvPrompt(null)
  }

  function rejectSv() {
    setSvPrompt(null)
    setPano(null)
  }

  function toggleStreetView() {
    setWantsStreetView((on) => {
      const next = !on
      if (!next) {
        setPano(null)
        setSvPrompt(null)
      }
      return next
    })
  }

  // "Mi ubicación": pide el GPS y, al obtenerlo, fija el punto y vuela el mapa ahí.
  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización. Toca el mapa.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLocating(false)
        setLocationSource('gps')
        pickPoint(p)
      },
      (err) => {
        setLocating(false)
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Diste «no» al permiso de ubicación. Actívalo o toca el mapa.'
            : err.code === err.TIMEOUT
              ? 'Tardó demasiado en localizarte. Reinténtalo o toca el mapa.'
              : 'No se pudo obtener tu ubicación. Toca el mapa.'
        toast.show(message, { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Gating de avance por etapa (también gobierna el arrastre del asa). En lugar
  // hace falta un punto y no avanzar con una búsqueda de Street View a medias (el
  // SV vive junto al punto, #388); en foto bloqueamos mientras se lee el EXIF.
  const canAdvanceFromStage: Record<Stage, boolean> = {
    0: point != null && !locating && !checkingPano && !svPrompt,
    1: !readingExif,
    2: true,
    3: false,
  }

  const readyToCreate =
    point != null &&
    title.trim().length > 0 &&
    mediaValid &&
    realDifficulty != null &&
    !svPrompt &&
    !checkingPano

  // Altura de la hoja: la etapa de lugar crece al haber punto (aparece el bloque de
  // Street View) y más cuando la previa de SV está montada (ocupa alto). El resto de
  // etapas usan su altura fija.
  const sheetHeight =
    stage === 0
      ? pano
        ? STAGE0_WITH_PANO
        : point != null
          ? STAGE0_WITH_POINT
          : STAGE_HEIGHTS[0]
      : STAGE_HEIGHTS[stage]

  function goStage(n: Stage) {
    setStage(n)
  }

  function advance() {
    // En vez de un botón muerto, explicamos por qué no se avanza (como en foto).
    if (stage === 0 && point != null && !canAdvanceFromStage[0]) {
      toast.show('Buscando Street View…', { tone: 'neutral' })
      return
    }
    if (stage === 1 && !canAdvanceFromStage[1]) {
      toast.show('Analizando foto…', { tone: 'neutral' })
      return
    }
    if (stage < 3 && canAdvanceFromStage[stage]) goStage((stage + 1) as Stage)
  }

  // Retroceder un paso SIN perder lo introducido (el estado vive en el padre): el
  // botón "Atrás" y el arrastre del asa hacia abajo comparten esta ruta (#388).
  function retreat() {
    if (stage > 0) goStage((stage - 1) as Stage)
  }

  // Atrás del topbar: si estamos en un paso intermedio, retrocede uno; solo sale
  // del flujo desde el primer paso. Así la flecha "<" siempre permite volver a
  // añadir/ajustar la pista en vez de tirar todo el reto (#388).
  function topBack() {
    if (stage > 0) retreat()
    else onBack()
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (!point || !realDifficulty) {
      toast.show('Falta dónde estás. Marca el punto en el mapa.', { tone: 'danger' })
      return
    }
    if (!isValidMedia({ hasPhoto, hasStreetView })) {
      toast.show('Un reto debe tener al menos foto o Street View.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      let imagePath: string | undefined
      if (photoFile) {
        // Foto nueva elegida: la subimos (comprimida + sin EXIF).
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      } else if (reusesPrefilledPhoto && prefilledImagePath) {
        // Foto del recuerdo de origen: ya está subida; la reutilizamos tal cual.
        imagePath = prefilledImagePath
      }

      setStatus('Lanzando el reto…')
      const { challenge } = await createChallenge({
        title: title.trim(),
        lat: point.lat,
        lng: point.lng,
        createdBy: user.id,
        groupId,
        svPanoId: pano?.panoId,
        svHeading: pano ? pov.heading : undefined,
        svPitch: pano ? pov.pitch : undefined,
        deadlineAt: deadlineFromMinutes(DEADLINE_OPTIONS[deadlineIndex].minutes),
        guessSeconds,
        imagePath,
        photoIsHint: true,
        scoreScale: PRECISION_OPTIONS[precisionIndex].value,
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: Boolean(imagePath),
        has_streetview: Boolean(pano),
        guess_seconds: guessSeconds,
        photo_is_hint: imagePath ? true : null,
        duration_hours: DEADLINE_OPTIONS[deadlineIndex].minutes / 60,
        difficulty: realDifficulty,
        score_scale: PRECISION_OPTIONS[precisionIndex].value,
        location_source: locationSource ?? 'manual',
      })
      // Microcelebración (burst + confeti) y, al terminar, la hoja "comparte el
      // enlace": el creador reparte el reto EN CALIENTE antes de ir a jugarlo (#330).
      setCelebrating(true)
      window.setTimeout(() => {
        setCelebrating(false)
        setCreated(challenge)
      }, 1500)
    } catch (err) {
      reportError(err, { area: 'create_challenge' })
      const msg = describeError(err)
      setStatus(null)
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo lanzar el reto: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  // PREVIA REAL (#234): la MISMA escena de juego que verán los jugadores, a
  // pantalla completa, con los datos del BORRADOR. No vota ni guarda.
  if (previewOpen && realDifficulty && point) {
    return (
      <GameScenePreview
        title={title}
        panoId={pano?.panoId ?? null}
        pov={pov}
        lockMove={false}
        lockRotate={false}
        point={point}
        photoUrl={photoPreview}
        guessSeconds={guessSeconds}
        onBack={() => setPreviewOpen(false)}
      />
    )
  }

  // El mapa es PROTAGONISTA (a sangre) solo en la etapa de lugar (0), que es donde se
  // coloca/ajusta el pin. En el resto de etapas (foto, detalles, resumen) se RECOGE a
  // una tarjeta-preview compacta arriba: deja de dominar y la hoja pasa a mandar. Así
  // el mapa full-bleed no acompaña a pasos que no van del mapa (#455 dir. de diseño).
  const mapRecessed = stage !== 0

  return (
    <div className={`${styles.root} ${mapRecessed ? styles.mapRecessedRoot : ''}`}>
      {/* MAPA SATÉLITE: protagonista a sangre en la etapa de lugar; recogido a una
          tarjeta-preview compacta (esquinas + hairline) en las demás etapas. Una sola
          instancia de Leaflet en ambos modos (solo cambia el marco por CSS). */}
      <div className={mapRecessed ? styles.mapCard : styles.mapFull}>
        <ImmersiveMap
          value={point}
          flyTo={flyTo}
          center={SPAIN}
          zoom={5}
          onPick={pickPoint}
          onInteract={() => setMapInteracted(true)}
        />
        {/* Etiqueta compacta sobre la tarjeta-preview (etapas recogidas): recuerda que
            el sitio queda oculto sin tapar el pin (va en una esquina, no al centro). */}
        {mapRecessed && point != null && (
          <span className={styles.mapCardTag}>
            <EyeOffMark />
            Oculto
          </span>
        )}
      </div>

      {/* Viñeta para legibilidad del chrome claro sobre el satélite (solo a sangre). */}
      {!mapRecessed && <div className={styles.vignette} aria-hidden />}

      {/* Guía "toca el mapa" antes de marcar. Desaparece al colocar el punto O al
          empezar a explorar (zoom/arrastre): no es un pin, es una ayuda (#388). */}
      {!mapRecessed && point == null && !mapInteracted && (
        <div className={styles.tapHint} aria-hidden>
          <span className={styles.tapRing}>
            <TargetIcon size={28} />
          </span>
          <span>Toca el mapa: marca dónde estás</span>
        </div>
      )}

      {/* Chip "tu sitio quedará oculto" en una franja ARRIBA, fuera del centro del
          mapa: el pin vive en el centro (donde vuela el flyTo), así que el chip nunca
          lo tapa y el pin se puede ajustar con precisión (#455-E). Solo a sangre. */}
      {!mapRecessed && point != null && (
        <div className={styles.coordChip}>
          <EyeOffMark />
          Tu sitio quedará oculto
        </div>
      )}

      {/* Cabecera ÚNICA (variante flotante sobre la escena satélite): mismo título
          serif y back-disco que el resto del flujo de crear. El back retrocede de
          paso (o sale en el primero); "mi ubicación" va en la ranura de acción. */}
      <AppHeader
        variant="floating"
        lead="back"
        onLead={topBack}
        leadLabel={stage > 0 ? 'Volver al paso anterior' : 'Salir'}
        title="Nuevo reto"
        action={
          <button
            type="button"
            className={styles.gpsBtn}
            aria-label="Usar mi ubicación actual"
            onClick={useGps}
            disabled={locating}
          >
            {locating ? <Spinner size={18} /> : <CrosshairIcon size={20} />}
          </button>
        }
      />

      {/* BOTTOM SHEET que sube y crece por etapas. */}
      <ImmersiveSheet
        stage={stage}
        total={TOTAL_STAGES}
        height={sheetHeight}
        canAdvance={canAdvanceFromStage[stage]}
        onAdvance={advance}
        onRetreat={retreat}
      >
        {/* ETAPA 0 — lugar: marcar el punto Y, junto a él, el Street View (#388). */}
        {stage === 0 && (
          <section className={styles.stage}>
            <div className={styles.mark}>
              <span className={styles.markIco}>
                <TargetIcon size={24} />
              </span>
              <div className={styles.markTxt}>
                <b>¿Dónde estás?</b>
                <span>
                  {point == null
                    ? 'Toca el mapa para soltar tu pin. Nadie lo verá.'
                    : 'Ajusta el pin si hace falta. Nadie verá tu sitio.'}
                </span>
              </div>
            </div>

            {/* Antes de marcar, adelantamos qué se desbloquea al soltar el pin: la
                foto y el Street View viven aquí mismo. Evita que el usuario crea que
                no hay Street View por no verlo hasta marcar (#453). */}
            {point == null && (
              <p className={styles.markHint}>
                <PanoramaIcon size={15} />
                Al marcar podrás añadir una foto y Street View.
              </p>
            )}

            {/* Street View JUNTO al punto: una vez marcado, se ofrece añadirlo aquí
                mismo, sin saltar a otro paso (#388). Reutiliza findPanorama / la
                previa StreetViewPreview; sin foto el SV es la escena (punto exacto),
                con foto es contexto a ≤50 m que se confirma. */}
            {point != null && (
              <>
                <button
                  type="button"
                  className={`${styles.toggleRow} ${wantsStreetView ? styles.toggleOn : ''}`}
                  aria-pressed={wantsStreetView}
                  onClick={toggleStreetView}
                >
                  <span className={styles.tIco}>
                    <PanoramaIcon size={20} />
                  </span>
                  <span className={styles.tTxt}>
                    <b>Añadir Street View</b>
                    <span>Pista extra: pasean por tu calle</span>
                  </span>
                  <span className={styles.switch} aria-hidden />
                </button>

                {checkingPano && (
                  <div className={styles.statusRow}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </div>
                )}

                {/* SV cercano a la foto: pedimos confirmar antes de adoptarlo. */}
                {svPrompt && (
                  <div className={styles.svPrompt}>
                    <span>
                      Encontramos Street View a {svPrompt.distanceMeters} m de tu foto. ¿Lo
                      añadimos?
                    </span>
                    <div className={styles.svPromptActions}>
                      <Button size="sm" onClick={acceptSv}>
                        Sí, usarlo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={rejectSv}>
                        No, gracias
                      </Button>
                    </div>
                  </div>
                )}

                {pano && (
                  <StreetViewPreview
                    panoId={pano.panoId}
                    heading={pov.heading}
                    pitch={pov.pitch}
                    onPovChange={setPov}
                  />
                )}

                <button className={styles.cta} type="button" onClick={advance}>
                  Siguiente: la foto
                  <ArrowRight />
                </button>
              </>
            )}
          </section>
        )}

        {/* ETAPA 1 — foto. */}
        {stage === 1 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 1 de 3 · La foto
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Enseña tu momento</h1>
            <p className={styles.sub}>
              Una foto de donde estás. Los demás la verán e intentarán adivinarlo en el mapa.
            </p>

            <PhotoDropzone
              preview={photoPreview}
              loading={readingExif}
              onPick={(file) => void onPhotoChange(file)}
              onClear={() => pickPhoto(null)}
            />

            <p className={styles.exif}>
              <CheckIcon size={14} className={styles.exifIco} />
              Quitamos los datos de localización de la foto: no delatan tu sitio.
            </p>

            <div className={styles.footer}>
              <button className={styles.back} type="button" onClick={retreat}>
                <BackArrow />
                Atrás
              </button>
              <button className={styles.cta} type="button" onClick={advance}>
                Siguiente: los detalles
                <ArrowRight />
              </button>
            </div>
          </section>
        )}

        {/* ETAPA 2 — detalles. */}
        {stage === 2 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 2 de 3 · Los detalles
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Pon las reglas</h1>
            <p className={styles.sub}>
              Un nombre, cuánto dura el reto y cuánto tiempo tiene cada uno para adivinarlo.
            </p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cci-name">
                Nombre del reto
              </label>
              <input
                id="cci-name"
                className={styles.input}
                type="text"
                placeholder="p. ej. ¿Dónde desayuné hoy?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Plazo para jugar <span>· cuándo cierra</span>
              </label>
              <div className={styles.seg}>
                {DEADLINE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={i === deadlineIndex ? styles.segSel : undefined}
                    aria-pressed={i === deadlineIndex}
                    onClick={() => setDeadlineIndex(i)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Tiempo por jugada <span>· cuenta atrás</span>
              </label>
              <div className={styles.seg}>
                {GUESS_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={i === guessIndex ? styles.segSel : undefined}
                    aria-pressed={i === guessIndex}
                    onClick={() => setGuessIndex(i)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Precisión <span>· cómo de estricto se puntúa</span>
              </label>
              <div className={styles.seg}>
                {PRECISION_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={i === precisionIndex ? styles.segSel : undefined}
                    aria-pressed={i === precisionIndex}
                    onClick={() => setPrecisionIndex(i)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className={styles.segHint}>¿Hay que acertar el país, la ciudad o la calle?</p>
            </div>

            <div className={styles.footer}>
              <button className={styles.back} type="button" onClick={retreat}>
                <BackArrow />
                Atrás
              </button>
              <button className={styles.cta} type="button" onClick={advance}>
                Revisar y lanzar
                <ArrowRight />
              </button>
            </div>
          </section>
        )}

        {/* ETAPA 3 — resumen + lanzar. */}
        {stage === 3 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 3 de 3 · Listo
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Lanza el reto</h1>
            <p className={styles.sub}>
              Esto verá tu grupo. Tu sitio en el mapa queda oculto hasta que todos jueguen.
            </p>

            <div className={styles.review}>
              <div className={styles.reviewRow}>
                {photoPreview ? (
                  <img className={styles.reviewThumb} src={photoPreview} alt="" />
                ) : (
                  <span className={styles.rIco}>
                    <CameraIcon size={18} />
                  </span>
                )}
                <div className={styles.rTxt}>
                  <small>Reto</small>
                  <b>{title.trim() || 'Reto sin nombre'}</b>
                </div>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.rIco}>
                  <TargetIcon size={18} />
                </span>
                <div className={styles.rTxt}>
                  <small>Dónde estás</small>
                  <b className={styles.hiddenMark}>
                    <EyeOffMark /> Marcado · queda oculto
                  </b>
                </div>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.rIco}>
                  <StopwatchIcon size={18} />
                </span>
                <div className={styles.rTxt}>
                  <small>Plazo · tiempo por jugada</small>
                  <b>
                    {DEADLINE_OPTIONS[deadlineIndex].review} · {GUESS_OPTIONS[guessIndex].review}
                  </b>
                </div>
              </div>
            </div>

            {!mediaValid && (
              <div className={styles.warning}>
                <Icon icon={AlertTriangle} size={18} />
                <div className={styles.warnBody}>
                  <span>Falta la pista: un reto necesita al menos una foto o un Street View.</span>
                  <div className={styles.warnActions}>
                    {/* Atajos a donde se añade cada pista: la foto vive en el paso 1;
                        el Street View, junto al punto en el paso de lugar (#388). */}
                    <button type="button" className={styles.warnBtn} onClick={() => goStage(1)}>
                      Añadir foto
                    </button>
                    <button type="button" className={styles.warnBtn} onClick={() => goStage(0)}>
                      Añadir Street View
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className={styles.ghost}
              disabled={point == null || !mediaValid}
              onClick={() => setPreviewOpen(true)}
            >
              <EyeIcon size={18} /> Ver cómo quedará
            </button>

            {status && (
              <div className={styles.statusRow}>
                <Spinner size={16} />
                <span>{status}</span>
              </div>
            )}

            <div className={styles.footer}>
              <button className={styles.back} type="button" onClick={retreat} disabled={busy}>
                <BackArrow />
                Atrás
              </button>
              <button
                className={styles.cta}
                type="button"
                disabled={!readyToCreate || busy}
                onClick={() => void save()}
              >
                {busy ? <Spinner size={18} /> : <Rocket />}
                Lanzar reto al grupo
              </button>
            </div>
          </section>
        )}
      </ImmersiveSheet>

      {/* Tras la celebración, hoja "comparte el enlace": el creador reparte el reto
          en caliente (Web Share / copiar / WhatsApp) o salta a verlo/jugarlo. */}
      {created && (
        <ChallengeCreatedShare
          groupId={groupId}
          groupName={groupName}
          challengeId={created.id}
          challengeTitle={created.title}
          onPlay={() => onCreated(created)}
        />
      )}

      {/* MICROCELEBRACIÓN al lanzar: burst + confeti + "¡Reto lanzado!". */}
      {celebrating && (
        <div className={styles.celebrate} role="status">
          <Confetti />
          <div className={styles.celebrateCard}>
            <span className={styles.burst}>
              <CheckIcon size={48} />
            </span>
            <h3 className={styles.serif}>¡Reto lanzado!</h3>
            <p>
              Tu grupo ya puede intentar adivinarlo.
              <br />
              Te avisamos cuando jueguen.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Iconos puntuales que no viven en CreateIcons (chrome flotante / lanzar) ---

function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Rocket() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Ojo tachado: "queda oculto" (refuerza que el sitio no se ve).
function EyeOffMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  )
}

// Confeti decorativo de la microcelebración: trozos con trayectorias al azar.
const CONFETTI_COLORS = ['#34506b', '#c9b888', '#7fb3c9', '#d98c5f', '#3f8f5e']

// Generamos las trayectorias UNA vez (fuera de render): el azar no debe recalcularse
// en cada render (regla react-hooks/purity), y el confeti se monta una sola vez.
function makeConfettiPieces() {
  return Array.from({ length: 22 }, (_, i) => ({
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    '--cx': `${Math.random() * 320 - 160}px`,
    '--cy': `${Math.random() * 260 + 80}px`,
    '--cr': `${Math.random() * 720 - 360}deg`,
    animationDelay: `${Math.random() * 0.12}s`,
  })) as React.CSSProperties[]
}

function Confetti() {
  const [pieces] = useState(makeConfettiPieces)
  return (
    <div className={styles.confettiLayer} aria-hidden>
      {pieces.map((style, i) => (
        <span key={i} className={styles.confetti} style={style} />
      ))}
    </div>
  )
}
