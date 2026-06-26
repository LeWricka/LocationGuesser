import { useEffect, useRef, useState } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { ScenePreview } from './ScenePreview'
import { WizardProgress } from './WizardProgress'
import type { LatLng } from '../../lib/geo'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, findPanoramaNear, type PanoramaMatch } from '../../lib/streetview'
import { resolveMapsUrl } from '../../lib/mapsUrl'
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
import {
  Badge,
  Button,
  ChallengePhoto,
  Field,
  FileButton,
  Input,
  Row,
  Spinner,
  Stack,
  useToast,
} from '../../ui'
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
type LocationSource = 'exif' | 'manual' | 'maps_url' | 'gps'

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
}

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

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

// Asistente paso a paso: una decisión por pantalla. La dificultad ya NO se elige;
// se DERIVA de los medios (foto y/o Street View) y se muestra en vivo.
type Step = 'location' | 'scene' | 'details' | 'preview'

const STEP_ORDER: Step[] = ['location', 'scene', 'details', 'preview']
const STEP_LABELS = ['Ubicación', 'Escena', 'Detalles', 'Previa']

export function CreateChallenge({ groupId, onBack, onCreated }: Props) {
  const [step, setStep] = useState<Step>('location')

  const [title, setTitle] = useState('')
  // Respuesta del reto (lat/lng oculto). Sale de la foto (EXIF), del mapa, de un
  // enlace de Maps o del GPS.
  const [point, setPoint] = useState<LatLng | null>(null)
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([])
  const [searching, setSearching] = useState(false)
  const [mapsLink, setMapsLink] = useState('')
  const [resolving, setResolving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // ¿El creador quiere incluir Street View? Toggle explícito del paso Escena. Al
  // activarlo buscamos panorama cerca del punto; al desactivarlo lo quitamos.
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

  // Autocompletado Nominatim con debounce; respeta su uso (300ms, solo > 2 car).
  useEffect(() => {
    const q = search.trim()
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (q.length < 3) {
        setSuggestions([])
        setSearching(false)
        return
      }
      setSearching(true)
      void (async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
            { signal: ctrl.signal },
          )
          const data = (await res.json()) as NominatimHit[]
          setSuggestions(data)
        } catch {
          // Búsqueda fallida o abortada: silenciamos; el mapa sigue disponible.
        } finally {
          setSearching(false)
        }
      })()
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [search])

  function pickSuggestion(hit: NominatimHit) {
    const p = { lat: Number(hit.lat), lng: Number(hit.lon) }
    setPoint(p)
    setFlyTo(p)
    setLocationSource('manual')
    setSearch(hit.display_name)
    setSuggestions([])
    setStatus(null)
  }

  // Pegar enlace de Maps: el parser local resuelve URLs largas y coordenadas al
  // instante; los enlaces cortos pasan por la Edge Function (de ahí el spinner).
  async function resolveLink(raw: string) {
    const value = raw.trim()
    if (!value) return
    setResolving(true)
    try {
      const p = await resolveMapsUrl(value)
      if (!p) {
        toast.show('No pude leer ese enlace; usa el mapa, GPS o búsqueda.', { tone: 'danger' })
        return
      }
      setPoint(p)
      setFlyTo(p)
      setLocationSource('maps_url')
      setStatus(null)
      setMapsLink('')
    } finally {
      setResolving(false)
    }
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
  const canLeaveLocation = point != null && !resolving && !locating
  const mediaValid = isValidMedia({ hasPhoto, hasStreetView })
  // El SV activo sin panorama (aún buscando o sin cobertura) y sin foto no es un
  // medio válido; con svPrompt pendiente forzamos decidir antes de seguir.
  const canLeaveScene = mediaValid && !svPrompt && !checkingPano
  const canLeaveDetails = title.trim().length > 0

  // Listo para crear: hay punto, medios válidos, sin confirmaciones pendientes y
  // título. Equivale a haber pasado los tres primeros gates.
  const readyToCreate =
    canLeaveLocation && canLeaveScene && canLeaveDetails && realDifficulty != null

  function goNext() {
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }

  // El botón "Volver": en el primer paso cancela (sale del flujo); entre pasos
  // retrocede uno.
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

  const currentStepIndex = STEP_ORDER.indexOf(step)

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={goBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Crear un reto</h1>
        </Row>

        <WizardProgress steps={STEP_LABELS} current={currentStepIndex} />

        {/* PASO 1 — UBICACIÓN: dónde es. Foto (EXIF), búsqueda, enlace, GPS, mapa. */}
        {step === 'location' && (
          <Stack gap={4}>
            <p className={styles.intro}>
              ¿Dónde es? Sube una foto (leemos dónde se hizo), busca el sitio, pega un enlace de
              Maps, usa tu ubicación o toca el mapa.
            </p>

            <Field
              label="Foto del reto (opcional aquí)"
              hint="Quitamos la ubicación que la foto pueda llevar dentro, para que no chive el sitio. Si la foto sabe dónde es, colocamos el pin por ti."
            >
              {(fieldProps) => (
                <Stack gap={3} align="start">
                  <FileButton
                    {...fieldProps}
                    accept="image/*"
                    loading={readingExif}
                    ariaLabel="Foto del reto"
                    onPick={(file) => void onPhotoChange(file)}
                  >
                    {readingExif
                      ? 'Leyendo la foto…'
                      : photoPreview
                        ? '📷 Cambiar foto'
                        : '📷 Añadir foto'}
                  </FileButton>
                  {photoPreview && (
                    <>
                      <ChallengePhoto src={photoPreview} alt="Vista previa de la foto del reto" />
                      <Button variant="ghost" size="sm" onClick={() => pickPhoto(null)}>
                        Quitar foto
                      </Button>
                    </>
                  )}
                </Stack>
              )}
            </Field>

            <div className={styles.searchWrap}>
              <Row gap={2}>
                <Button variant="secondary" loading={locating} onClick={useGps}>
                  📡 Mi ubicación
                </Button>
                <div className={styles.searchField}>
                  <Input
                    className={styles.searchInput}
                    placeholder="Buscar un lugar…"
                    aria-label="Buscar un lugar"
                    autoComplete="off"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {searching && (
                    <span className={styles.searchSpinner}>
                      <Spinner size={16} label="Buscando" />
                    </span>
                  )}
                </div>
              </Row>
              {suggestions.length > 0 && (
                <ul className={styles.suggestions}>
                  {suggestions.map((hit, i) => (
                    <li key={`${hit.lat},${hit.lon},${i}`}>
                      <button
                        type="button"
                        className={styles.suggestion}
                        onClick={() => pickSuggestion(hit)}
                      >
                        {hit.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Field
              label="Pega un enlace de Google Maps"
              hint="Funciona con el botón «Compartir» de Maps o con coordenadas."
            >
              {(fieldProps) => (
                <Row gap={2}>
                  <div className={styles.searchField}>
                    <Input
                      {...fieldProps}
                      className={styles.searchInput}
                      placeholder="https://maps.app.goo.gl/… o 40.4,-3.7"
                      autoComplete="off"
                      value={mapsLink}
                      onChange={(e) => setMapsLink(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void resolveLink(mapsLink)
                        }
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text')
                        if (text) void resolveLink(text)
                      }}
                    />
                    {resolving && (
                      <span className={styles.searchSpinner}>
                        <Spinner size={16} label="Resolviendo enlace" />
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    loading={resolving}
                    disabled={!mapsLink.trim()}
                    onClick={() => void resolveLink(mapsLink)}
                  >
                    Usar enlace
                  </Button>
                </Row>
              )}
            </Field>

            <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPoint} />

            {point && (
              <Row gap={2}>
                <Badge tone="accent">📍 Dónde es</Badge>
                <span className={styles.coords}>
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              </Row>
            )}

            <Button size="lg" fullWidth disabled={!canLeaveLocation} onClick={goNext}>
              Siguiente →
            </Button>
          </Stack>
        )}

        {/* PASO 2 — ESCENA: qué incluye el reto. Foto y/o Street View. La
            dificultad se deriva y se muestra en vivo. */}
        {step === 'scene' && (
          <Stack gap={4}>
            <p className={styles.intro}>
              Elige qué verán los demás. Cuanta menos información, más difícil; la dificultad se
              calcula sola.
            </p>

            {/* Badge de dificultad en vivo. */}
            {realDifficulty ? (
              <Stack gap={1} className={styles.difficultyBadge}>
                <Row gap={2} align="center">
                  <span className={styles.difficultyLead}>Este reto será</span>
                  <Badge tone="accent">{DIFFICULTY_LABEL[realDifficulty]}</Badge>
                </Row>
                <span className={styles.hint}>{DIFFICULTY_BLURB[realDifficulty]}</span>
              </Stack>
            ) : (
              <p className={styles.hint}>
                Añade una foto o activa Street View para tener un reto que mostrar.
              </p>
            )}

            {/* FOTO: si ya la subió en el paso anterior, la mostramos con opción de
                cambiar/quitar; si no, puede subirla aquí. */}
            <Field
              label="Foto"
              hint="Quitamos la ubicación que la foto pueda llevar dentro, para que no chive el sitio."
            >
              {(fieldProps) => (
                <Stack gap={3} align="start">
                  <FileButton
                    {...fieldProps}
                    accept="image/*"
                    loading={readingExif}
                    ariaLabel="Foto del reto"
                    onPick={(file) => void onPhotoChange(file)}
                  >
                    {readingExif
                      ? 'Leyendo la foto…'
                      : photoPreview
                        ? '📷 Cambiar foto'
                        : '📷 Añadir foto'}
                  </FileButton>
                  {photoPreview && (
                    <>
                      <ChallengePhoto src={photoPreview} alt="Vista previa de la foto del reto" />
                      <Button variant="ghost" size="sm" onClick={() => pickPhoto(null)}>
                        Quitar foto
                      </Button>
                    </>
                  )}
                </Stack>
              )}
            </Field>

            {/* STREET VIEW: toggle que busca panorama cerca del punto. */}
            <Field
              label="Street View"
              hint="Inclúyelo para que puedan explorar el panorama de la ubicación."
            >
              {() => (
                <Stack gap={3}>
                  <Row gap={2} align="center" wrap>
                    <Button
                      variant={wantsStreetView ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={wantsStreetView}
                      onClick={toggleStreetView}
                    >
                      {wantsStreetView ? '✓ ' : ''}Incluir Street View
                    </Button>
                    {checkingPano && (
                      <Row gap={2} className={styles.status}>
                        <Spinner size={16} />
                        <span>Buscando Street View…</span>
                      </Row>
                    )}
                  </Row>

                  {/* Aviso de SV cercano (con foto): confirmar usarlo o no. */}
                  {svPrompt && (
                    <Stack gap={2} className={styles.svPrompt}>
                      <span>
                        El Street View más cercano está a {svPrompt.distanceMeters} m de tu foto.
                        ¿Lo usamos?
                      </span>
                      <Row gap={2} wrap>
                        <Button size="sm" onClick={acceptSv}>
                          Sí, usarlo
                        </Button>
                        <Button variant="secondary" size="sm" onClick={rejectSv}>
                          No
                        </Button>
                      </Row>
                      <p className={styles.hint}>
                        Si dices que no, recoloca el punto para buscar otro panorama, o desactiva el
                        Street View y el reto será 🔴 Difícil (solo foto).
                      </p>
                    </Stack>
                  )}

                  {/* Previa del panorama (ya confirmado). */}
                  {pano && (
                    <Stack gap={2}>
                      <StreetViewPreview
                        panoId={pano.panoId}
                        heading={pov.heading}
                        pitch={pov.pitch}
                        onPovChange={setPov}
                      />
                    </Stack>
                  )}

                  {/* CANDADOS DE EXPLORACIÓN (#187): opciones avanzadas, solo con
                      panorama. Ambos permitidos por defecto; desactívalos para
                      hacer el reto más difícil. */}
                  {pano && (
                    <details className={styles.advanced}>
                      <summary className={styles.advancedSummary}>Opciones avanzadas</summary>
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
                            {allowMove
                              ? 'Pueden avanzar a calles contiguas.'
                              : 'Quietos en el sitio: no pueden avanzar.'}
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
                            {allowRotate
                              ? 'Pueden girar la cámara libremente.'
                              : 'Vista fija: no pueden girar la cámara.'}
                          </span>
                        </Row>
                      </Stack>
                    </details>
                  )}
                </Stack>
              )}
            </Field>

            <Button size="lg" fullWidth disabled={!canLeaveScene} onClick={goNext}>
              Siguiente →
            </Button>
          </Stack>
        )}

        {/* PASO 3 — DETALLES: título (obligatorio), duración y tiempo por jugada. */}
        {step === 'details' && (
          <Stack gap={4}>
            <Field label="Título del reto" hint="Ponle un nombre para que el grupo lo reconozca.">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  placeholder="¿Dónde estoy? 🌍"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>

            <Field label="Duración del reto" hint="Cuánto tiempo queda abierto para contestar.">
              {(fieldProps) => {
                const stop = DURATION_STOPS[durationIndex]
                const isExpress = stop.minutes <= EXPRESS_MAX_MINUTES
                return (
                  <Stack gap={2}>
                    <Row gap={2} className={styles.durationValue}>
                      <span className={styles.durationLabel}>{stop.label}</span>
                      {isExpress && <span className={styles.expressPill}>⚡ Express</span>}
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
                      aria-label="Duración del reto"
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

            <Button size="lg" fullWidth disabled={!canLeaveDetails} onClick={goNext}>
              Ver cómo quedará →
            </Button>
          </Stack>
        )}

        {/* PASO 4 — PREVIA: lo que verán los participantes + crear. */}
        {step === 'preview' && realDifficulty && (
          <Stack gap={4}>
            <ScenePreview
              difficulty={realDifficulty}
              panoId={pano?.panoId ?? null}
              pov={pov}
              photoUrl={photoPreview}
            />
            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={!readyToCreate}
              onClick={() => void save()}
            >
              Confirmar y crear reto
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setStep('details')}>
              ← Volver a editar
            </Button>
            {status && (
              <Row gap={2} className={styles.status}>
                <Spinner size={16} />
                <span>{status}</span>
              </Row>
            )}
          </Stack>
        )}
      </Stack>
    </main>
  )
}
