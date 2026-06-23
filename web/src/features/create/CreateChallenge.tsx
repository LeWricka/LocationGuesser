import { useEffect, useState } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import type { LatLng } from '../../lib/geo'
import { createChallenge } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import type { Challenge } from '../../lib/database.types'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { resolveMapsUrl } from '../../lib/mapsUrl'
import { uploadImage } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import {
  Badge,
  Button,
  ChallengePhoto,
  Field,
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
  onCreated: (challenge: Challenge) => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

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

// Parada por defecto: 24 h.
const DEFAULT_DURATION_INDEX = DURATION_STOPS.findIndex((s) => s.minutes === 1440)

// Hasta este umbral (incluido) la duración cuenta como "express".
const EXPRESS_MAX_MINUTES = 15

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

export function CreateChallenge({ groupId, onBack, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [point, setPoint] = useState<LatLng | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([])
  const [searching, setSearching] = useState(false)
  const [mapsLink, setMapsLink] = useState('')
  const [resolving, setResolving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Panorama encajado al punto elegido (pivote #54): si es null no hay cobertura
  // de Street View y no dejamos crear el reto.
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  // POV con el que arrancarán los jugadores; el creador puede girar la previa.
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })
  // Duración del reto como índice en DURATION_STOPS; 24 h por defecto.
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(120)
  // Foto opcional del reto (se sube sin EXIF). `photoIsHint` decide si se ve al
  // jugar (pista) o se reserva para el revelado (sorpresa). `photoPreview` es un
  // object URL que gestionamos en el handler (revocar el anterior al cambiar)
  // para no fugar memoria sin recurrir a un efecto.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoIsHint, setPhotoIsHint] = useState(true)
  const toast = useToast()
  const { user } = useSession()

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  // Al elegir el punto (por cualquier método) encajamos el panorama de Street
  // View más cercano. Sin cobertura → avisamos y bloqueamos la creación.
  useEffect(() => {
    if (!point) return
    let cancelled = false
    void (async () => {
      setCheckingPano(true)
      setPano(null)
      try {
        const match = await findPanorama(point.lat, point.lng)
        if (cancelled) return
        if (!match) {
          toast.show('No hay Street View aquí; elige otro punto.', { tone: 'danger' })
          return
        }
        setPano(match)
        setPov({ heading: 0, pitch: 0 })
      } finally {
        if (!cancelled) setCheckingPano(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // toast es estable (contexto); solo reaccionamos al punto elegido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point])

  // Autocompletado Nominatim con debounce; respeta su uso (300ms, solo > 2 car).
  // `searching` enciende el spinner del buscador para que el usuario vea que pasa algo.
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
    setSearch(hit.display_name)
    setSuggestions([])
    setStatus(null)
  }

  // Pegar enlace de Maps: el parser local resuelve URLs largas y coordenadas al
  // instante; los enlaces cortos (botón Compartir de Maps en móvil) pasan por la
  // Edge Function, de ahí el spinner. `resolveMapsUrl` ya distingue ambos casos.
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
      setStatus(null)
      setMapsLink('')
    } finally {
      setResolving(false)
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.show('No se pudo obtener tu ubicación. Toca el mapa.', { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  async function generate() {
    if (!pano) {
      toast.show('Elige un punto con cobertura de Street View.', { tone: 'danger' })
      return
    }
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      // Foto opcional: la subimos comprimida y SIN EXIF (uploadImage estripa el
      // GPS, que sería la respuesta). Solo si el creador adjuntó una.
      let imagePath: string | undefined
      if (photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Guardando el reto…')
      // El plazo es relativo: congelamos "ahora + duración elegida" como instante
      // absoluto. Guardamos la lat/lng encajada al panorama (la respuesta real
      // para el scoring) y el panorama exacto + POV inicial. El creador es el
      // user_id de la sesión.
      const { challenge } = await createChallenge({
        title: title.trim() || '¿Dónde estoy? 🌍',
        lat: pano.lat,
        lng: pano.lng,
        createdBy: user.id,
        groupId,
        svPanoId: pano.panoId,
        svHeading: pov.heading,
        svPitch: pov.pitch,
        deadlineAt: deadlineFromMinutes(DURATION_STOPS[durationIndex].minutes),
        guessSeconds,
        imagePath,
        photoIsHint,
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: Boolean(imagePath),
        guess_seconds: guessSeconds,
      })
      // El grupo recoge el reto, vuelve a la lista y ofrece su enlace.
      onCreated(challenge)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(null)
      // "Failed to fetch" suele ser la red/navegador del usuario bloqueando la
      // conexión (VPN, DNS privado, bloqueador, ahorro de datos), no la app.
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

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Crear un reto</h1>
        </Row>

        <p className={styles.intro}>
          Elige un punto con cobertura de Street View. Los demás explorarán el panorama y adivinarán
          dónde es.
        </p>

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

        <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={setPoint} />

        {point && (
          <Row gap={2}>
            <Badge tone="accent">📍 Punto marcado</Badge>
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

        {pano && (
          <Field label="Vista previa" hint="Gira la cámara para fijar cómo arrancarán los demás.">
            {() => (
              <StreetViewPreview
                panoId={pano.panoId}
                heading={pov.heading}
                pitch={pov.pitch}
                onPovChange={setPov}
              />
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

        <Field
          label="Foto del reto"
          hint="Opcional. Se sube sin datos de ubicación (sin EXIF). Por ejemplo, una foto tuya en el sitio."
        >
          {(fieldProps) => (
            <Stack gap={3} align="start">
              <input
                {...fieldProps}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              />
              {photoPreview && (
                <>
                  <ChallengePhoto src={photoPreview} alt="Vista previa de la foto del reto" />
                  <Row gap={2} wrap>
                    <Button
                      variant={photoIsHint ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={photoIsHint}
                      onClick={() => setPhotoIsHint(true)}
                    >
                      Foto como pista
                    </Button>
                    <Button
                      variant={!photoIsHint ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={!photoIsHint}
                      onClick={() => setPhotoIsHint(false)}
                    >
                      Foto sorpresa
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => pickPhoto(null)}>
                      Quitar foto
                    </Button>
                  </Row>
                  <p className={styles.hint}>
                    {photoIsHint
                      ? 'Visible al jugar, junto al Street View.'
                      : 'Oculta hasta el revelado (al votar).'}
                  </p>
                </>
              )}
            </Stack>
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
          loading={busy}
          disabled={!pano || checkingPano}
          onClick={() => void generate()}
        >
          Crear reto
        </Button>

        {status && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>{status}</span>
          </Row>
        )}
      </Stack>
    </main>
  )
}
