import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import type { LatLng } from '../../lib/geo'
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

// Plazo del reto: duración relativa en minutos.
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

// Centro y zoom inicial del mapa (España como fallback cuando no hay GPS).
const DEFAULT_CENTER: LatLng = { lat: 40.4, lng: -3.7 }
const DEFAULT_ZOOM = 5
// Radio de búsqueda del panorama desde el punto elegido (metros).
const PANO_SEARCH_RADIUS = 80

// Estado de la búsqueda de panorama tras elegir un punto en el mapa.
type PanoState =
  | { kind: 'idle' } // sin punto elegido aún
  | { kind: 'searching'; at: LatLng } // buscando panorama
  | { kind: 'ready'; pano: PanoramaMatch } // panorama encontrado
  | { kind: 'no_coverage'; at: LatLng } // sin cobertura SV en ese punto

// Estado del GPS (solo para centrar el mapa, no es la respuesta).
type GpsState = 'idle' | 'locating' | 'done' | 'error'

// Reto ¿Dónde? con selección MANUAL del punto en el mapa.
//
// Flujo:
//  1. Mapa (Leaflet) — el usuario toca para elegir el sitio.
//  2. Al elegir el punto: se busca el panorama de Street View más cercano.
//  3. Si hay cobertura → previa de SV del punto elegido + CTA "Lanzar".
//     Si no hay cobertura → aviso inline, CTA deshabilitado.
//  4. "Usar mi ubicación" (GPS, botón secundario) vuela el mapa a tu posición.
//  5. CTA crea el reto con lat/lng del panorama + panoId + POV.
export function CreateLocationChallenge({ groupId, groupName, onBack, onCreated }: Props) {
  // Punto elegido por el usuario en el mapa (pin).
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null)
  // flyTo: coordenadas a las que debe volar el mapa (GPS o nada).
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  // Centro inicial del mapa: actualizado con GPS si llega antes de que el usuario interactúe.
  const [mapCenter, setMapCenter] = useState<LatLng>(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)

  // Estado de la búsqueda de panorama.
  const [panoState, setPanoState] = useState<PanoState>({ kind: 'idle' })
  // POV capturado de la previa (encuadre inicial para los jugadores).
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })

  const [gpsState, setGpsState] = useState<GpsState>('idle')

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  const toast = useToast()
  const { user } = useSession()
  // Id incremental para cancelar búsquedas de panorama en vuelo.
  const searchIdRef = useRef(0)

  // Al montar: intentamos obtener el GPS para centrar el mapa automáticamente.
  // Si llega antes de que el usuario toque el mapa, arranca ya centrado en su posición.
  // No llamamos setGpsState('locating') aquí (setState síncrono en effect = cascada);
  // el estado 'locating' lo gestionamos solo en el botón GPS manual.
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsState('done')
        // Solo centramos si el usuario aún no ha elegido punto (no queremos "saltar" el mapa).
        setPickedPoint((prev) => {
          if (!prev) {
            setMapCenter(p)
            setMapZoom(14)
            setFlyTo(p)
          }
          return prev
        })
      },
      () => setGpsState('error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  // Botón "Usar mi ubicación": vuela el mapa a tu posición GPS actual.
  function useGpsLocation() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización.', { tone: 'danger' })
      return
    }
    setGpsState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsState('done')
        setFlyTo(p)
      },
      () => {
        setGpsState('error')
        toast.show('No se pudo obtener tu ubicación.', { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Al elegir un punto en el mapa: buscamos el panorama de SV más cercano.
  const handlePick = useCallback(async (point: LatLng) => {
    setPickedPoint(point)
    const myId = ++searchIdRef.current
    setPanoState({ kind: 'searching', at: point })

    const match = await findPanorama(point.lat, point.lng, PANO_SEARCH_RADIUS)
    // Si llegó otra búsqueda mientras esperábamos, ignoramos este resultado.
    if (searchIdRef.current !== myId) return

    if (!match) {
      setPanoState({ kind: 'no_coverage', at: point })
    } else {
      setPanoState({ kind: 'ready', pano: match })
    }
  }, [])

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (panoState.kind !== 'ready') {
      toast.show('Elige un punto en el mapa con cobertura de Street View.', { tone: 'danger' })
      return
    }

    const pano = panoState.pano
    setBusy(true)
    try {
      setStatus('Lanzando el reto…')
      const title = groupName ? `¿Dónde? · ${groupName}` : '¿Dónde?'
      const { challenge } = await createChallenge({
        title,
        lat: pano.lat,
        lng: pano.lng,
        createdBy: user.id,
        groupId,
        svPanoId: pano.panoId,
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
        location_source: 'map_pick',
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

  const isSearching = panoState.kind === 'searching'
  const noCoverage = panoState.kind === 'no_coverage'
  const hasPano = panoState.kind === 'ready'
  const canLaunch = hasPano && !busy
  const isGpsLocating = gpsState === 'locating'

  return (
    <div className={styles.root}>
      {/* Cabecera: atrás + título + botón GPS secundario. */}
      <AppHeader
        variant="plain"
        lead="back"
        onLead={onBack}
        leadLabel="Atrás"
        title="¿Dónde?"
        action={
          <button
            type="button"
            className={styles.gpsBtn}
            aria-label="Usar mi ubicación"
            title="Centrar el mapa en mi posición"
            onClick={useGpsLocation}
            disabled={isGpsLocating}
          >
            {isGpsLocating ? <Spinner size={18} /> : <IconGps size={20} />}
          </button>
        }
      />

      {/* Área principal: mapa de selección. */}
      <div className={styles.mapArea}>
        <MapPicker
          value={pickedPoint}
          flyTo={flyTo}
          center={mapCenter}
          zoom={mapZoom}
          onPick={(p) => void handlePick(p)}
        />
        {/* Hint inicial: solo cuando no hay punto elegido. */}
        {!pickedPoint && (
          <div className={styles.mapHint} aria-live="polite">
            <MapPin size={15} strokeWidth={1.8} aria-hidden />
            Toca el mapa para elegir el sitio
          </div>
        )}
      </div>

      {/* Panel inferior: estado del SV + reglas + CTA. */}
      <div className={styles.panel}>
        {/* ── Sin punto elegido: lede explicativo ── */}
        {!pickedPoint && (
          <p className={styles.idleLede}>
            Elige el sitio exacto en el mapa arriba. Los demás adivinarán dónde es.
          </p>
        )}

        {/* ── Buscando panorama ── */}
        {isSearching && (
          <div className={styles.searchingState} role="status">
            <Spinner size={20} />
            <span>Buscando Street View…</span>
          </div>
        )}

        {/* ── Sin cobertura de SV ── */}
        {noCoverage && (
          <div className={styles.noCoverageState} role="alert">
            <MapPin size={18} strokeWidth={1.5} className={styles.noCoverageIco} aria-hidden />
            <div>
              <p className={styles.noCoverageTitle}>Sin Street View aquí</p>
              <p className={styles.noCoverageSub}>
                Mueve el pin a una calle con cobertura para poder lanzar el reto.
              </p>
            </div>
          </div>
        )}

        {/* ── Panorama listo: previa interactiva + reglas ── */}
        {hasPano && panoState.kind === 'ready' && (
          <>
            <div className={styles.svPreviewWrap}>
              <StreetViewPreview
                panoId={panoState.pano.panoId}
                heading={pov.heading}
                pitch={pov.pitch}
                onPovChange={setPov}
              />
              {/* Chip de privacidad sobre la previa. */}
              <div className={styles.privacyChip} aria-hidden>
                <IconCandado size={12} />
                Tu sitio queda oculto
              </div>
            </div>

            <div className={styles.rules}>
              <div className={styles.ruleRow}>
                <label className={styles.ruleLabel}>Plazo</label>
                <SegmentedControl
                  label="Plazo para jugar"
                  options={DEADLINE_OPTIONS.map((opt, i) => ({
                    value: String(i),
                    label: opt.label,
                  }))}
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
          </>
        )}

        {/* CTA y nota de privacidad — aparecen solo cuando hay punto elegido. */}
        {pickedPoint && (
          <div className={styles.footer}>
            {status && (
              <div className={styles.statusRow}>
                <Spinner size={15} />
                <span>{status}</span>
              </div>
            )}
            {hasPano && (
              <div className={styles.privacy}>
                <IconCandado size={14} aria-hidden />
                <span>Tu posición en el mapa queda oculta hasta que todos jueguen.</span>
              </div>
            )}
            <button
              type="button"
              className={styles.launchBtn}
              disabled={!canLaunch}
              onClick={() => void save()}
              aria-label={
                noCoverage
                  ? 'Sin Street View — elige otro punto en el mapa'
                  : 'Este es mi sitio: lanzar el reto al grupo'
              }
            >
              {busy ? <Spinner size={18} /> : <RocketIcon />}
              {noCoverage
                ? 'Sin Street View — elige otro punto'
                : 'Este es mi sitio · Lanzar el reto'}
            </button>
          </div>
        )}
      </div>

      {/* Microcelebración al lanzar. */}
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
