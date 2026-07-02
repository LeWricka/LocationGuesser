import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { AppHeader, SegmentedControl, Spinner, useToast } from '../../ui'
import { IconGps } from '../../ui/icons/IconGps'
import { IconCandado } from '../../ui/icons/IconCandado'
import styles from './CreateLocationChallenge.module.css'

interface Props {
  /** Grupo (el viaje) al que se añade el reto. */
  groupId: string
  /** Nombre del viaje para el contexto de cabecera. */
  groupName?: string | null
  /** Sale del flujo sin crear. */
  onBack: () => void
  /** Reto creado: el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

// Plazo del reto: duración relativa en minutos. El mismo set que el flujo clásico.
const DEADLINE_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 720, label: 'Hoy' },
  { minutes: 4320, label: '3 días' },
]
const DEFAULT_DEADLINE_INDEX = 1 // 4 h

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '60 s' },
  { value: null, label: 'Libre' },
]
const DEFAULT_GUESS_INDEX = 1 // 30 s

// Radio de búsqueda del panorama desde la posición GPS inicial (metros).
const GPS_PANO_RADIUS = 80

// Estado de carga del Street View.
type SvState =
  | { kind: 'locating' } // esperando GPS
  | { kind: 'searching'; lat: number; lng: number } // buscando panorama
  | { kind: 'no_location' } // GPS denegado / error
  | { kind: 'no_coverage'; lat: number; lng: number } // sin cobertura SV
  | { kind: 'ready'; pano: PanoramaMatch } // panorama disponible

// Reto ¿Dónde? GeoGuessr puro: el Street View ES la escena, no una pista opcional.
// El creador navega dentro del SV hasta su sitio exacto; la posición del panorama
// activo (lat/lng) es la respuesta oculta. Sin foto, sin mapa+pin, sin pasos extra.
//
// Flujo:
//  1. Montar → pedir GPS → findPanorama → abrir el SV en pantalla completa.
//  2. El creador pasea dentro del SV; cada position_changed actualiza la respuesta.
//  3. Barra compacta abajo: reglas + CTA "Este es mi sitio · Lanzar el reto".
//  4. Al lanzar: createChallenge con lat/lng del panorama activo + panoId + POV.
// Devuelve el estado inicial del SV según si hay geolocalización disponible.
// Se llama UNA vez al inicializar el componente (no en el render loop).
function initialSvState(): SvState {
  return navigator.geolocation ? { kind: 'locating' } : { kind: 'no_location' }
}

export function CreateLocationChallenge({ groupId, groupName, onBack, onCreated }: Props) {
  const [svState, setSvState] = useState<SvState>(initialSvState)
  const [currentPano, setCurrentPano] = useState<PanoramaMatch | null>(null)
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  const svRef = useRef<HTMLDivElement>(null)
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const streetViewLib = useMapsLibrary('streetView')
  const toast = useToast()
  const { user } = useSession()

  // Paso 1: pedir GPS al montar (solo si hay geolocalización; si no, el estado
  // inicial ya es 'no_location' y el efecto no corre gracias a la condición).
  useEffect(() => {
    if (svState.kind !== 'locating') return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSvState({ kind: 'searching', lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setSvState({ kind: 'no_location' })
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
    // Solo corre cuando entramos en el estado 'locating' (inicio o re-centrado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svState.kind === 'locating'])

  // Paso 2: buscar el panorama al tener coordenadas.
  useEffect(() => {
    if (svState.kind !== 'searching') return
    const { lat, lng } = svState
    let alive = true
    void (async () => {
      const match = await findPanorama(lat, lng, GPS_PANO_RADIUS)
      if (!alive) return
      if (!match) {
        setSvState({ kind: 'no_coverage', lat, lng })
      } else {
        setSvState({ kind: 'ready', pano: match })
        setCurrentPano(match)
      }
    })()
    return () => {
      alive = false
    }
  }, [svState])

  // El panoId efectivo (solo cuando el estado es ready).
  const readyPanoId = svState.kind === 'ready' ? svState.pano.panoId : null

  // Paso 3: montar el StreetViewPanorama cuando hay cobertura y la lib cargó.
  useEffect(() => {
    if (!readyPanoId || !streetViewLib || !svRef.current) return

    const panorama = new streetViewLib.StreetViewPanorama(svRef.current, {
      pano: readyPanoId,
      pov: { heading: 0, pitch: 0 },
      // Ocultar lo que delata la ubicación (spoiler) y los controles innecesarios.
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      zoomControl: false,
      panControl: false,
      enableCloseButton: false,
      motionTracking: false,
      motionTrackingControl: false,
      // SÍ permitir navegar entre panoramas: el usuario pasea hasta su sitio exacto.
      linksControl: true,
    })
    panoramaRef.current = panorama

    // Seguimos el POV (encuadre) al girar la vista.
    const povListener = panorama.addListener('pov_changed', () => {
      const p = panorama.getPov()
      setPov({ heading: p.heading, pitch: p.pitch })
    })

    // Seguimos la posición real del panorama al navegar entre panoramas adyacentes.
    // getPano() devuelve el panoId activo; la posición es el lat/lng del panorama.
    const posListener = panorama.addListener('position_changed', () => {
      const pos = panorama.getPosition()
      // getPano no está en los tipos públicos pero sí en el objeto nativo de Maps.
      const activePanoId = (panorama as unknown as { getPano: () => string }).getPano?.()
      if (pos && activePanoId) {
        const updated: PanoramaMatch = { panoId: activePanoId, lat: pos.lat(), lng: pos.lng() }
        setCurrentPano(updated)
      }
    })

    return () => {
      povListener.remove()
      posListener.remove()
      panoramaRef.current = null
    }
    // readyPanoId es la identidad del panorama; al cambiar (re-centrado), re-montamos.
  }, [readyPanoId, streetViewLib])

  // Botón GPS: re-centrar al panorama de la posición GPS actual.
  function recenterGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización.', { tone: 'danger' })
      return
    }
    // Guardamos el pano actual por si el GPS falla y hay que restaurar.
    const prevPano = currentPano
    setSvState({ kind: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSvState({ kind: 'searching', lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        toast.show('No se pudo obtener tu ubicación.', { tone: 'danger' })
        // Restaurar el estado anterior para no dejar el SV en "locating".
        if (prevPano) {
          setSvState({ kind: 'ready', pano: prevPano })
        } else {
          setSvState({ kind: 'no_location' })
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (!currentPano) {
      toast.show('No hay panorama activo. Muévete a un punto con Street View.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      setStatus('Lanzando el reto…')
      // Título por defecto: el nombre del viaje si está disponible, o un genérico.
      const title = groupName ? `¿Dónde? · ${groupName}` : '¿Dónde?'
      const { challenge } = await createChallenge({
        title,
        lat: currentPano.lat,
        lng: currentPano.lng,
        createdBy: user.id,
        groupId,
        svPanoId: currentPano.panoId,
        svHeading: pov.heading,
        svPitch: pov.pitch,
        deadlineAt: deadlineFromMinutes(DEADLINE_OPTIONS[deadlineIndex].minutes),
        guessSeconds: GUESS_OPTIONS[guessIndex].value,
        // Sin foto: el SV es el contenido completo.
        // Ciudad como escala default (el GeoGuessr de la calle pide precisión de zona).
        scoreScale: 'ciudad',
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: false,
        has_streetview: true,
        guess_seconds: GUESS_OPTIONS[guessIndex].value,
        photo_is_hint: null,
        duration_hours: DEADLINE_OPTIONS[deadlineIndex].minutes / 60,
        difficulty: 'streetview',
        score_scale: 'ciudad',
        location_source: 'gps',
      })
      setCelebrating(true)
      window.setTimeout(() => {
        setCelebrating(false)
        setCreated(challenge)
      }, 1400)
    } catch (err) {
      reportError(err, { area: 'create_location_challenge' })
      const msg = describeError(err)
      setStatus(null)
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión. Prueba con datos o WiFi y reinténtalo.'
          : `No se pudo lanzar el reto: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  const isLoading = svState.kind === 'locating' || svState.kind === 'searching'
  const noCoverage = svState.kind === 'no_coverage'
  const noLocation = svState.kind === 'no_location'
  const hasPane = svState.kind === 'ready'
  const canLaunch = hasPane && currentPano != null && !busy

  return (
    <div className={styles.root}>
      {/* Cabecera flotante: atrás + título + botón GPS (solo con SV activo). */}
      <AppHeader
        variant="floating"
        lead="back"
        onLead={onBack}
        leadLabel="Atrás"
        title="¿Dónde estás?"
        action={
          hasPane ? (
            <button
              type="button"
              className={styles.gpsBtn}
              aria-label="Volver a mi posición GPS"
              onClick={recenterGps}
            >
              <IconGps size={20} />
            </button>
          ) : undefined
        }
      />

      {/* Street View a sangre: ocupa toda la pantalla. */}
      <div className={styles.sv} ref={svRef} aria-label="Street View" />

      {/* Estado de carga / error superpuesto. */}
      {isLoading && (
        <div className={styles.overlay} role="status">
          <Spinner size={28} />
          <span>{svState.kind === 'locating' ? 'Localizándote…' : 'Buscando Street View…'}</span>
        </div>
      )}

      {noLocation && (
        <div className={styles.overlay} role="alert">
          <MapPin size={32} strokeWidth={1.5} className={styles.overlayIco} />
          <p className={styles.overlayTitle}>No pudimos localizarte</p>
          <p className={styles.overlaySub}>
            Activa la ubicación en tu navegador e inténtalo de nuevo.
          </p>
          <button type="button" className={styles.retryCta} onClick={recenterGps}>
            Reintentar
          </button>
        </div>
      )}

      {noCoverage && (
        <div className={styles.overlay} role="alert">
          <MapPin size={32} strokeWidth={1.5} className={styles.overlayIco} />
          <p className={styles.overlayTitle}>Sin Street View aquí</p>
          <p className={styles.overlaySub}>No hay cobertura de Street View cerca de tu posición.</p>
          <button type="button" className={styles.retryCta} onClick={recenterGps}>
            Reintentar con otra posición
          </button>
        </div>
      )}

      {/* Chip de privacidad: flota en la parte superior cuando el SV está activo. */}
      {hasPane && (
        <div className={styles.placeChip} aria-hidden>
          <IconCandado size={13} />
          Tu sitio queda oculto
        </div>
      )}

      {/* Hoja inferior compacta con las reglas y el CTA de lanzar. */}
      {hasPane && (
        <div className={styles.sheet}>
          <div className={styles.sheetPull}>
            <span className={styles.sheetBar} />
          </div>

          <p className={styles.sheetLede}>
            Navega hasta tu sitio exacto. Los demás adivinarán en el mapa.
          </p>

          <div className={styles.rules}>
            <div className={styles.ruleRow}>
              <label className={styles.ruleLabel}>Plazo</label>
              <SegmentedControl
                label="Plazo para jugar"
                options={DEADLINE_OPTIONS.map((opt, i) => ({ value: String(i), label: opt.label }))}
                value={String(deadlineIndex)}
                onChange={(v) => setDeadlineIndex(Number(v))}
              />
            </div>
            <div className={styles.ruleRow}>
              <label className={styles.ruleLabel}>Tiempo por jugada</label>
              <SegmentedControl
                label="Tiempo por jugada"
                options={GUESS_OPTIONS.map((opt, i) => ({ value: String(i), label: opt.label }))}
                value={String(guessIndex)}
                onChange={(v) => setGuessIndex(Number(v))}
              />
            </div>
          </div>

          {status && (
            <div className={styles.statusRow}>
              <Spinner size={15} />
              <span>{status}</span>
            </div>
          )}

          <div className={styles.footer}>
            <div className={styles.privacy}>
              <IconCandado size={14} />
              <span>Tu posición en el mapa queda oculta hasta que todos jueguen.</span>
            </div>
            <button
              type="button"
              className={styles.launchBtn}
              disabled={!canLaunch}
              onClick={() => void save()}
              aria-label="Este es mi sitio: lanzar el reto al grupo"
            >
              {busy ? <Spinner size={18} /> : <RocketIcon />}
              Este es mi sitio · Lanzar el reto
            </button>
          </div>
        </div>
      )}

      {/* Microcelebración al lanzar: overlay oscuro + burst + texto. */}
      {celebrating && (
        <div className={styles.celebrate} role="status">
          <div className={styles.celebrateCard}>
            <span className={styles.burst}>
              <CheckIcon />
            </span>
            <h3 className={styles.celebrateH}>¡Reto lanzado!</h3>
            <p className={styles.celebrateSub}>Tu grupo ya puede intentar adivinarlo.</p>
          </div>
        </div>
      )}

      {/* Hoja de compartir tras crear el reto. */}
      {created && (
        <ChallengeCreatedShare
          groupId={groupId}
          groupName={groupName}
          challengeId={created.id}
          challengeTitle={created.title}
          onPlay={() => onCreated(created)}
        />
      )}
    </div>
  )
}

// --- Iconos puntuales ---

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
