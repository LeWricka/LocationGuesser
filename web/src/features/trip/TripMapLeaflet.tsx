import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers } from 'lucide-react'
import { Icon } from '../../ui'
import type { RoutePoint } from '../../lib/trip'
import type { TripMapProps as Props } from './TripMap.types'
import { HELP_MARKER_SVG, PIN_MARKER_SVG } from './pinMarkers'
import { drawnRouteCount } from './routeDraw'
import './tripPins.css'
import styles from './TripMapLeaflet.module.css'

// Satélite Esri World Imagery sin API key — BASEMAP POR DEFECTO (fase "nuevo
// enfoque"): el mapamundi satélite es el héroe, da la inmersión "mundo real" y
// hace que los recuerdos manden. Los pines-foto y la ruta en acento (tokens) son
// el color de marca encima.
const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

// Basemap CLARO Carto Positron, papel gris minimalista sin API key — ahora capa
// OPT-IN (toggle en el chrome) para quien prefiera el plano sobrio en vez del satélite.
const POSITRON_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const POSITRON_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// Centro/zoom de arranque (el mundo) hasta que fitBounds encuadra los pines.
const WORLD: L.LatLngExpression = [25, 0]
const WORLD_ZOOM = 2

// Encuadre de pines — MISMOS valores que el globo (`TripMapGlobe`) para que el
// mapa se vea igual sea cual sea el motor:
//  - SINGLE_ZOOM: un solo punto → zoom de ciudad.
//  - FIT_MAX_ZOOM: techo al encuadrar varios (no acercarse de más con pines juntos).
//  - FIT_PADDING: margen en px [top, right, bottom, left]; deja hueco al chrome
//    (arriba) y al carrusel (abajo) sin tapar pines.
const SINGLE_ZOOM = 11
const FIT_MAX_ZOOM = 12
// Leaflet acepta paddingTopLeft/paddingBottomRight para asimetría.
const FIT_PAD_TOP_LEFT: L.PointTuple = [48, 88]
const FIT_PAD_BOTTOM_RIGHT: L.PointTuple = [48, 220]
// Zoom mínimo al volar a un pin seleccionado: ciudad.
const SELECT_ZOOM = 11

/**
 * Posición FLOTANTE del momento activo: nunca su coordenada real (spoiler), sino
 * el centroide de los puntos cerrados (o el centro del mapa si aún no hay ninguno).
 * Es la implementación del principio nº3 del diseño.
 */
function floatingActivePos(route: RoutePoint[]): L.LatLngExpression {
  if (route.length === 0) return WORLD
  const lat = route.reduce((s, p) => s + p.lat, 0) / route.length
  const lng = route.reduce((s, p) => s + p.lng, 0) / route.length
  return [lat, lng]
}

// Pin-foto de un momento CERRADO: miniatura redonda con anillo blanco, clavada en
// su lat/lng. Sin foto → disco con el pin lucide (MapPin). El color del anillo va
// inline para que el token gobierne sin hardcodear (el module fija el resto).
function closedPinIcon(point: RoutePoint): L.DivIcon {
  const ring = 'var(--pin-ring-closed)'
  const inner = point.imageUrl
    ? `background-image:url('${point.imageUrl.replace(/'/g, "\\'")}')`
    : ''
  const klass = point.imageUrl ? 'lg-trip-pin' : 'lg-trip-pin lg-trip-pin--icon'
  const body = point.imageUrl ? '' : PIN_MARKER_SVG
  return L.divIcon({
    className: '',
    html: `<div class="${klass}" style="border-color:${ring};${inner}">${body}</div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  })
}

// Pin del momento ACTIVO: anillo cálido pulsante + icono "?" (no clavado en su sitio).
function activePinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="lg-trip-pin lg-trip-pin--icon lg-trip-pin--active">${HELP_MARKER_SVG}</div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  })
}

/**
 * Encuadra TODOS los pines (cerrados + posición flotante del activo) una vez tras
 * montar. Con un solo punto, centra con zoom medio. Reusa el patrón fitBounds de
 * AllGuessesMap pero en Leaflet.
 */
function FitToPins({
  route,
  activePos,
}: {
  route: RoutePoint[]
  activePos: L.LatLngExpression | null
}) {
  const map = useMap()
  useEffect(() => {
    const pts: L.LatLngExpression[] = route.map((p) => [p.lat, p.lng])
    if (activePos) pts.push(activePos)
    if (pts.length === 0) return
    if (pts.length === 1) {
      // Un solo punto: zoom de ciudad (no de país), igual que el globo.
      map.setView(pts[0], SINGLE_ZOOM)
      return
    }
    map.fitBounds(L.latLngBounds(pts), {
      paddingTopLeft: FIT_PAD_TOP_LEFT,
      paddingBottomRight: FIT_PAD_BOTTOM_RIGHT,
      maxZoom: FIT_MAX_ZOOM,
    })
    // Solo al montar / cambiar el conjunto de puntos; el pan por selección lo
    // gestiona PanToSelected, que no debe re-encuadrar todo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, activePos])
  return null
}

/**
 * Al cambiar la selección, vuela con ZOOM al pin elegido (no solo pan): tocar una
 * tarjeta debe ACERCAR al punto. Si el seleccionado es el momento activo (sin
 * coordenada real), volamos a su posición flotante; si no, a su lat/lng real.
 */
function PanToSelected({
  selectedChallengeId,
  route,
  activeChallengeId,
  activePos,
}: {
  selectedChallengeId: string | null
  route: RoutePoint[]
  activeChallengeId: string | null
  activePos: L.LatLngExpression | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!selectedChallengeId) return
    const target = route.find((p) => p.challengeId === selectedChallengeId)
    const center: L.LatLngExpression | null = target
      ? [target.lat, target.lng]
      : selectedChallengeId === activeChallengeId
        ? activePos
        : null
    if (!center) return
    // Zoom a nivel ciudad como mínimo; conservamos el actual si ya está más cerca.
    map.flyTo(center, Math.max(map.getZoom(), SELECT_ZOOM), { duration: 0.6 })
  }, [selectedChallengeId, route, activeChallengeId, activePos, map])
  return null
}

/**
 * Mapa PLANO de la ruta del viaje (Leaflet + satélite Esri por defecto) — el "suelo"
 * garantizado del pivote (el globo 3D/MapLibre es otra tarea). Pinta:
 *  - un pin-foto circular por momento cerrado, clavado en su lat/lng;
 *  - el momento activo FLOTANDO sobre el centroide de los cerrados (anti-spoiler),
 *    con anillo cálido pulsante;
 *  - la ruta: línea continua entre cerrados + tramo discontinuo hacia el activo.
 */
export function TripMapLeaflet({
  route,
  activeMoment,
  selectedChallengeId,
  playing = false,
  onSelectMoment,
}: Props) {
  // Capa de fondo: SATÉLITE (Esri) por defecto (fase "nuevo enfoque"); el plano
  // claro (Positron) solo si el usuario lo pide con el toggle del chrome (opt-in).
  // No persiste: cada visita arranca en satélite, el estado de reposo del atlas.
  const [satellite, setSatellite] = useState(true)

  const activePos = useMemo<L.LatLngExpression | null>(
    () => (activeMoment ? floatingActivePos(route) : null),
    [activeMoment, route],
  )

  // Línea ORO que cose los momentos cerrados en orden cronológico.
  const closedLine = useMemo<L.LatLngExpression[]>(() => route.map((p) => [p.lat, p.lng]), [route])

  // DIBUJADO POR ETAPAS en play: el tramo recorrido (hasta el momento seleccionado,
  // inclusive) va en oro sólido; el pendiente queda en oro tenue y discontinuo, como
  // si la ruta se trazara a medida que el "avión" avanza. En reposo NO partimos: la
  // ruta entera se ve sólida. (Lógica pura compartida con el globo en `routeDraw`.)
  const drawnCount = useMemo<number>(
    () => drawnRouteCount(route, selectedChallengeId, playing),
    [playing, selectedChallengeId, route],
  )

  // Tramo recorrido (oro sólido) y pendiente (oro tenue discontinuo). Compartimos el
  // vértice de corte para que las dos líneas se toquen sin hueco.
  const drawnLine = useMemo<L.LatLngExpression[]>(
    () => closedLine.slice(0, Math.max(drawnCount, 0)),
    [closedLine, drawnCount],
  )
  const pendingLine = useMemo<L.LatLngExpression[]>(
    () => (drawnCount < closedLine.length ? closedLine.slice(Math.max(drawnCount - 1, 0)) : []),
    [closedLine, drawnCount],
  )

  // Tramo discontinuo del último cerrado a la posición flotante del activo (aún
  // "no clavado"): la ruta no termina en su sitio real, solo apunta hacia él.
  const dashLine = useMemo<L.LatLngExpression[] | null>(() => {
    if (!activePos || route.length === 0) return null
    const last = route[route.length - 1]
    return [[last.lat, last.lng], activePos]
  }, [activePos, route])

  return (
    <div className={styles.wrap}>
      <MapContainer center={WORLD} zoom={WORLD_ZOOM} className={styles.map} worldCopyJump>
        {/* Capa de fondo según el modo. `key` fuerza el remonte del TileLayer al
            alternar para que Leaflet cambie de juego de tiles sin estados raros. */}
        {satellite ? (
          <TileLayer
            key="esri"
            attribution={ESRI_ATTRIBUTION}
            url={ESRI_URL}
            maxNativeZoom={19}
            maxZoom={20}
            keepBuffer={6}
            updateWhenZooming={false}
          />
        ) : (
          <TileLayer
            key="positron"
            attribution={POSITRON_ATTRIBUTION}
            url={POSITRON_URL}
            maxNativeZoom={20}
            maxZoom={20}
            keepBuffer={6}
            updateWhenZooming={false}
          />
        )}

        {/* Tramo RECORRIDO en oro sólido (token --route-gold). En reposo es la ruta
            entera; en play crece hasta el momento seleccionado. */}
        {drawnLine.length >= 2 && (
          <Polyline positions={drawnLine} pathOptions={{ color: 'var(--route-gold)', weight: 3 }} />
        )}

        {/* Tramo PENDIENTE en oro tenue y discontinuo (solo durante el dibujado). */}
        {pendingLine.length >= 2 && (
          <Polyline
            positions={pendingLine}
            pathOptions={{ color: 'var(--route-gold-soft)', weight: 3, dashArray: '4 8' }}
          />
        )}

        {/* Tramo discontinuo hacia el activo flotante (oro tenue). */}
        {dashLine && (
          <Polyline
            positions={dashLine}
            pathOptions={{ color: 'var(--route-gold-soft)', weight: 3, dashArray: '6 8' }}
          />
        )}

        {/* Pines-foto de los momentos cerrados, clavados en su sitio real. */}
        {route.map((p) => (
          <Marker
            key={p.challengeId}
            position={[p.lat, p.lng]}
            icon={closedPinIcon(p)}
            eventHandlers={{ click: () => onSelectMoment(p.challengeId) }}
          />
        ))}

        {/* Pin del momento activo: flotando, nunca en su coordenada real. */}
        {activeMoment && activePos && (
          <Marker
            position={activePos}
            icon={activePinIcon()}
            eventHandlers={{ click: () => onSelectMoment(activeMoment.challengeId) }}
          />
        )}

        <FitToPins route={route} activePos={activePos} />
        <PanToSelected
          selectedChallengeId={selectedChallengeId}
          route={route}
          activeChallengeId={activeMoment?.challengeId ?? null}
          activePos={activePos}
        />
      </MapContainer>

      {/* Toggle de capa: pastilla clara del chrome (estilo Atelier). Alterna entre
          el satélite (Esri) por defecto y el plano claro (Positron) opt-in. */}
      <button
        type="button"
        className={`${styles.layerToggle} ${satellite ? styles.layerToggleActive : ''}`}
        onClick={() => setSatellite((s) => !s)}
        aria-pressed={satellite}
        aria-label={satellite ? 'Ver mapa claro' : 'Ver satélite'}
      >
        <Icon icon={Layers} size={18} />
      </button>
    </div>
  )
}
