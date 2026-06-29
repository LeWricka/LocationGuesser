import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RoutePoint } from '../../lib/trip'
import type { TripMapProps as Props } from './TripMap.types'
import './tripPins.css'
import styles from './TripMapLeaflet.module.css'

// Satélite Esri sin API key — la MISMA capa que usa MapPicker (recon §4). El
// look "mundo real" encaja con el diario de viaje y no añade dependencias.
const ESRI_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

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
// su lat/lng. Sin foto → disco con emoji 📍. El color del anillo va inline para que
// el token gobierne sin hardcodear (el module fija el resto del estilo).
function closedPinIcon(point: RoutePoint): L.DivIcon {
  const ring = 'var(--pin-ring-closed)'
  const inner = point.imageUrl
    ? `background-image:url('${point.imageUrl.replace(/'/g, "\\'")}')`
    : ''
  const klass = point.imageUrl ? 'lg-trip-pin' : 'lg-trip-pin lg-trip-pin--icon'
  const body = point.imageUrl ? '' : '📍'
  return L.divIcon({
    className: '',
    html: `<div class="${klass}" style="border-color:${ring};${inner}">${body}</div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  })
}

// Pin del momento ACTIVO: anillo cálido pulsante + ❓ (no clavado en su sitio real).
function activePinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div class="lg-trip-pin lg-trip-pin--icon lg-trip-pin--active">❓</div>',
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
 * Mapa PLANO de la ruta del viaje (Leaflet + satélite Esri) — el "suelo"
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
  onSelectMoment,
}: Props) {
  const activePos = useMemo<L.LatLngExpression | null>(
    () => (activeMoment ? floatingActivePos(route) : null),
    [activeMoment, route],
  )

  // Línea continua que cose los momentos cerrados en orden.
  const closedLine = useMemo<L.LatLngExpression[]>(() => route.map((p) => [p.lat, p.lng]), [route])

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
        <TileLayer
          attribution={ESRI_ATTRIBUTION}
          url={ESRI_URL}
          maxNativeZoom={19}
          maxZoom={20}
          keepBuffer={6}
          updateWhenZooming={false}
        />

        {/* Ruta continua entre cerrados (token --route-line). */}
        {closedLine.length >= 2 && (
          <Polyline
            positions={closedLine}
            pathOptions={{ color: 'var(--route-line)', weight: 3 }}
          />
        )}

        {/* Tramo discontinuo hacia el activo flotante (token --route-line-dash). */}
        {dashLine && (
          <Polyline
            positions={dashLine}
            pathOptions={{ color: 'var(--route-line-dash)', weight: 3, dashArray: '6 8' }}
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
    </div>
  )
}
