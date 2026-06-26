import { useEffect, useRef, useState } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { DifficultyPicker } from './DifficultyPicker'
import { ScenePreview } from './ScenePreview'
import type { LatLng } from '../../lib/geo'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, findPanoramaNear, type PanoramaMatch } from '../../lib/streetview'
import { resolveMapsUrl } from '../../lib/mapsUrl'
import { uploadImage } from '../../lib/storage'
import { readGpsFromExif } from '../../lib/exif'
import {
  type Difficulty,
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

// Radio (m) en el que buscamos Street View alrededor de la respuesta en Fácil.
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

// Pasos del asistente: elegir dificultad → montar el reto → previa y confirmar.
type Step = 'difficulty' | 'build' | 'preview'

export function CreateChallenge({ groupId, onBack, onCreated }: Props) {
  const [step, setStep] = useState<Step>('difficulty')
  // Dificultad ELEGIDA por el creador. La REAL puede degradar (p.ej. Fácil sin
  // SV → Difícil): la derivamos de los medios al guardar/previsualizar.
  const [chosen, setChosen] = useState<Difficulty | null>(null)

  const [title, setTitle] = useState('')
  // Respuesta del reto (lat/lng oculto). En Fácil/Difícil sale de la foto (EXIF)
  // o del mapa; en Medio, del punto con cobertura de Street View.
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
  // Panorama de Street View encajado (Fácil/Medio). En Fácil es OPCIONAL (la foto
  // es la respuesta y el SV es contexto); el creador puede quitarlo → pasa a Difícil.
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  // En Fácil avisamos a qué distancia cayó el SV de la foto para que el creador
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
  // Duración del reto como índice en DURATION_STOPS; 24 h por defecto.
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(60)
  // Foto del reto (se sube SIN EXIF). En Fácil va siempre como pista (visible al
  // jugar, junto al Street View); en Difícil ES la escena. `photoPreview` es un
  // object URL que revocamos al cambiar para no fugar memoria.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [readingExif, setReadingExif] = useState(false)
  const toast = useToast()
  const { user } = useSession()

  // Token para descartar respuestas de búsquedas de panorama obsoletas: si el
  // creador mueve el pin mientras una búsqueda está en curso, ignoramos la vieja.
  const panoSearchToken = useRef(0)

  const wantsStreetView = chosen === 'facil' || chosen === 'medio'
  const wantsPhoto = chosen === 'facil' || chosen === 'dificil'

  function resetForDifficulty(difficulty: Difficulty) {
    setChosen(difficulty)
    setPoint(null)
    setLocationSource(null)
    setPano(null)
    setSvPrompt(null)
    setPov({ heading: 0, pitch: 0 })
    setAllowMove(true)
    setAllowRotate(true)
    pickPhoto(null)
    setStep('build')
  }

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  // Adjuntar foto en Fácil/Difícil: leemos el GPS del File ORIGINAL (antes de que
  // uploadImage lo estripe). Con GPS → es la respuesta (pin ajustable); sin GPS →
  // pedimos colocarla en el mapa a mano.
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
        setLocationSource(null)
        toast.show('Esta foto no dice dónde es. Colócala en el mapa.', { tone: 'neutral' })
      }
    } finally {
      setReadingExif(false)
    }
  }

  // Colocar/ajustar el punto en el mapa (manual). En Fácil/Difícil esto fija (o
  // ajusta) la respuesta; en Medio elige el punto que debe tener cobertura SV.
  function pickPoint(p: LatLng) {
    setPoint(p)
    // El origen es "manual" salvo que ya viniera de EXIF y solo lo estén ajustando:
    // mantenemos 'exif' como origen primario (ajustar el pin no cambia que la pista
    // de ubicación vino de la foto). En Medio el origen es siempre el punto elegido.
    if (locationSource == null || chosen === 'medio') setLocationSource('manual')
  }

  // Al fijar el punto buscamos Street View, con criterio por dificultad:
  //  · Medio: el reto ES el panorama → exigimos cobertura (sin SV, otro punto).
  //  · Fácil: el SV es contexto a ≤50 m de la foto → si está lejos/ausente avisamos
  //    y dejamos seguir (la foto manda); el reto puede degradar a Difícil.
  //  · Difícil: no buscamos SV (aunque exista, no se muestra).
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
        if (chosen === 'medio') {
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
        } else if (chosen === 'facil') {
          const near = await findPanoramaNear(point.lat, point.lng, SV_NEAR_RADIUS)
          if (token !== panoSearchToken.current) return
          if (!near) {
            // Sin SV cerca: el reto será Difícil (solo foto). No bloqueamos.
            toast.show(
              'No hay Street View cerca de la foto. Se creará como 🔴 Difícil (solo foto), o elige otra ubicación.',
              { tone: 'neutral' },
            )
            return
          }
          // Pedimos confirmación del SV cercano antes de adoptarlo (puede estar a
          // unos metros de la foto: es correcto, pero el creador decide).
          setSvPrompt({ pano: near, distanceMeters: near.distanceMeters })
        }
      } finally {
        if (token === panoSearchToken.current) setCheckingPano(false)
      }
    })()
    // toast es estable (contexto); reaccionamos al punto y a la dificultad elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, chosen, wantsStreetView])

  // Confirmar el Street View cercano propuesto (Fácil): lo adoptamos como contexto.
  function acceptSv() {
    if (!svPrompt) return
    setPano(svPrompt.pano)
    setPov({ heading: 0, pitch: 0 })
    setSvPrompt(null)
  }

  // Rechazar el SV propuesto: lo descartamos. El creador puede recolocar el punto
  // (otra búsqueda) o quitar el SV → el reto pasa a Difícil.
  function rejectSv() {
    setSvPrompt(null)
    setPano(null)
  }

  // Quitar el Street View en Fácil → el reto pasa a 🔴 Difícil (solo foto).
  function removeStreetView() {
    setPano(null)
    setSvPrompt(null)
    setChosen('dificil')
    toast.show('Street View quitado: el reto será 🔴 Difícil (solo foto).', { tone: 'neutral' })
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
  // ahí. En Medio (el reto ES el panorama) comprobamos cobertura de Street View
  // en el punto: si no hay, lo decimos claro PERO conservamos la ubicación (el
  // creador la afina moviendo el pin). El spinner se apaga SIEMPRE, también en
  // error, y diferenciamos permiso denegado / timeout / no disponible.
  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización. Toca el mapa.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        // Fijamos la ubicación SIEMPRE: el efecto de `point` buscará el SV cuando
        // toque (Medio/Fácil). La cobertura no debe tragarse la posición.
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

  // ¿Está el reto listo para previsualizar/guardar según su dificultad real?
  const realDifficulty: Difficulty | null = point
    ? difficultyFromMedia({
        hasPhoto: wantsPhoto && Boolean(photoFile),
        hasStreetView: Boolean(pano),
      })
    : null

  // Listo para avanzar a la previa: hay punto (respuesta) y los medios son válidos
  // (al menos foto o SV). En Medio hace falta panorama; en Fácil/Difícil, foto.
  const readyToPreview =
    point != null &&
    !svPrompt &&
    realDifficulty != null &&
    isValidMedia({
      hasPhoto: wantsPhoto && Boolean(photoFile),
      hasStreetView: Boolean(pano),
    }) &&
    // Medio exige panorama (es la escena); Fácil/Difícil exigen foto.
    (wantsStreetView ? chosen === 'facil' || pano != null : true) &&
    (!wantsPhoto || photoFile != null)

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (!point || !realDifficulty) {
      toast.show('Falta la ubicación del reto.', { tone: 'danger' })
      return
    }
    if (
      !isValidMedia({ hasPhoto: wantsPhoto && Boolean(photoFile), hasStreetView: Boolean(pano) })
    ) {
      toast.show('Un reto debe tener al menos foto o Street View.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      // Foto opcional: la subimos comprimida y SIN EXIF. El GPS ya lo leímos del
      // File original al adjuntarla; aquí solo sube la versión estripada.
      let imagePath: string | undefined
      if (wantsPhoto && photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Guardando el reto…')
      // La respuesta del reto es SIEMPRE `point` (la foto/manual mandan). El
      // panorama (cuando lo hay) es contexto explorable, aunque caiga a unos
      // metros de la respuesta: es correcto.
      const { challenge } = await createChallenge({
        title: title.trim() || '¿Dónde estoy? 🌍',
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
        // En Fácil la foto es siempre pista (acompaña al panorama).
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
        // Nuevas props del flujo guiado por dificultad (no son eventos nuevos).
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

  // El botón "Volver" del header: en build vuelve a elegir dificultad; en preview
  // vuelve a montar; en difficulty cancela (sale del flujo de crear).
  function headerBack() {
    if (step === 'preview') setStep('build')
    else if (step === 'build') setStep('difficulty')
    else onBack()
  }

  // El mapa: en Medio se busca el punto del panorama; en Fácil/Difícil se coloca
  // o ajusta el pin (la respuesta).
  const showMap = step === 'build' && chosen != null

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={headerBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Crear un reto</h1>
        </Row>

        {step === 'difficulty' && <DifficultyPicker onPick={resetForDifficulty} />}

        {step === 'build' && chosen != null && (
          <Stack gap={4}>
            <Row gap={2}>
              <Badge tone="accent">{DIFFICULTY_LABEL[realDifficulty ?? chosen]}</Badge>
            </Row>

            {/* FOTO — Fácil y Difícil: la subida lee el GPS del EXIF. */}
            {wantsPhoto && (
              <Field
                label="Foto del reto"
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
            )}

            {/* UBICACIÓN — buscador, GPS y enlace de Maps. En Medio elige el punto
                con cobertura SV; en Fácil/Difícil coloca/ajusta la respuesta. */}
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

            {showMap && (
              <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPoint} />
            )}

            {point && (
              <Row gap={2}>
                <Badge tone="accent">📍 {wantsPhoto ? 'Dónde es' : 'Punto del reto'}</Badge>
                <span className={styles.coords}>
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </span>
              </Row>
            )}

            {checkingPano && (
              <Row gap={2} className={styles.status}>
                <Spinner size={16} />
                <span>Buscando Street View…</span>
              </Row>
            )}

            {/* Aviso de SV cercano (Fácil): confirmar usarlo o no. */}
            {svPrompt && (
              <Stack gap={2} className={styles.svPrompt}>
                <span>
                  El Street View más cercano está a {svPrompt.distanceMeters} m de tu foto. ¿Lo
                  usamos?
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
                  Si dices que no, recoloca el punto para buscar otro panorama, o quita el Street
                  View y el reto será 🔴 Difícil (solo foto).
                </p>
              </Stack>
            )}

            {/* Previa del panorama (Fácil/Medio, ya confirmado). */}
            {pano && (
              <Field
                label="Vista previa de Street View"
                hint="Gira la cámara para fijar cómo arrancarán los demás."
              >
                {() => (
                  <Stack gap={2}>
                    <StreetViewPreview
                      panoId={pano.panoId}
                      heading={pov.heading}
                      pitch={pov.pitch}
                      onPovChange={setPov}
                    />
                    {chosen === 'facil' && (
                      <Button variant="ghost" size="sm" onClick={removeStreetView}>
                        Quitar Street View (→ 🔴 Difícil)
                      </Button>
                    )}
                  </Stack>
                )}
              </Field>
            )}

            {/* CANDADOS DE EXPLORACIÓN (#187): solo con panorama. Ambos permitidos
                por defecto; desactívalos para hacer el reto más difícil. */}
            {pano && (
              <Field
                label="Cómo se explora"
                hint="Desactiva una opción para que el reto sea más difícil. Por defecto se puede todo."
              >
                {() => (
                  <Stack gap={3}>
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
                )}
              </Field>
            )}

            <Field
              label="Título del reto"
              hint="Opcional. Si lo dejas vacío usamos «¿Dónde estoy? 🌍»."
            >
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

            <Button
              size="lg"
              fullWidth
              disabled={!readyToPreview || checkingPano}
              onClick={() => setStep('preview')}
            >
              Ver cómo quedará →
            </Button>
          </Stack>
        )}

        {step === 'preview' && chosen != null && (
          <Stack gap={4}>
            <ScenePreview
              difficulty={realDifficulty ?? chosen}
              panoId={pano?.panoId ?? null}
              pov={pov}
              photoUrl={wantsPhoto ? photoPreview : null}
            />
            <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
              Confirmar y crear reto
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setStep('build')}>
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
