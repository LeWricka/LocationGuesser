import { useEffect, useMemo, useState } from 'react'
import {
  AttributionControl,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers } from 'lucide-react'
import { Icon, MapSkeleton } from '../../ui'
import type { RoutePoint } from '../../lib/trip'
import {
  CARTO_POSITRON,
  ESRI_REFERENCE_LABELS,
  ESRI_SATELLITE,
  FIT_MAX_ZOOM,
  SELECT_ZOOM,
  SINGLE_ZOOM,
} from '../../lib/mapPresets'
import type { TripMapProps as Props } from './TripMap.types'
import { buildPinElement, PIN_SIZE, PIN_TAIL } from './pinMarkers'
import { drawnRouteCount } from './routeDraw'
import './tripPins.css'
import styles from './TripMapLeaflet.module.css'

// Capas de mapa centralizadas en `mapPresets`: el diario es el PRESET "diario"
// (satélite Esri a sangre + etiquetas de ciudad superpuestas). El plano claro
// (Positron) queda como capa OPT-IN del toggle para quien prefiera el papel sobrio.

// Centro/zoom de arranque (el mundo) hasta que fitBounds encuadra los pines.
const WORLD: L.LatLngExpression = [25, 0]
const WORLD_ZOOM = 2

// Encuadre de pines — MISMOS valores que el globo (`TripMapGlobe`), centralizados en
// `mapPresets`, para que el mapa se vea igual sea cual sea el motor. FIT_PADDING en
// px deja hueco al chrome (arriba) y al carrusel (abajo) sin tapar pines.
// Leaflet acepta paddingTopLeft/paddingBottomRight para asimetría.
const FIT_PAD_TOP_LEFT: L.PointTuple = [48, 88]
const FIT_PAD_BOTTOM_RIGHT: L.PointTuple = [48, 220]

// Red de seguridad del skeleton: si el `load` de la capa base nunca llega (teselas
// que fallan en bucle, o un doble de mapa en tests/galería), el skeleton no debe
// quedar pegado para siempre tapando el mapa con un spinner sin salida (bug #500:
// "spinner desnudo"). Pasado este margen, lo damos por listo igual.
const MAP_READY_FALLBACK_MS = 4000

// Ancla del divIcon en la PUNTA del pin (centro-x, base): el círculo va arriba y la
// puntita apunta al lugar. El alto incluye el tallo bajo el círculo (PIN_TAIL).
const PIN_ICON_SIZE: L.PointTuple = [PIN_SIZE, PIN_SIZE + PIN_TAIL]
const PIN_ICON_ANCHOR: L.PointTuple = [PIN_SIZE / 2, PIN_SIZE + PIN_TAIL]

// Pin-foto de un momento CERRADO (estilo Polarsteps): miniatura redonda con borde
// blanco y puntita, clavada en su lat/lng. Sin foto → disco de acento con la inicial
// del lugar (nunca un anillo vacío). El seleccionado lleva aro dorado (`featured`).
// `divIcon.html` acepta un HTMLElement: le pasamos el de `buildPinElement`, que precarga
// la foto y solo la sube si carga de verdad —una URL firmada de Storage caducada/404 cae
// limpio a la inicial en vez de dejar un recuadro oscuro (el bug del pin ilegible).
function closedPinIcon(point: RoutePoint, featured: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: buildPinElement({ imageUrl: point.imageUrl, title: point.title, featured }),
    iconSize: PIN_ICON_SIZE,
    iconAnchor: PIN_ICON_ANCHOR,
  })
}

/**
 * Encuadra TODOS los pines (momentos cerrados) una vez tras montar. Con un solo
 * punto, centra con zoom medio. Reusa el patrón fitBounds de AllGuessesMap pero
 * en Leaflet. El momento EN JUEGO nunca entra aquí: mientras dura no aparece en
 * el mapa en absoluto (ni clavado ni flotando — issue #593), así que no puede
 * influir en el encuadre.
 */
function FitToPins({ route }: { route: RoutePoint[] }) {
  const map = useMap()
  useEffect(() => {
    const pts: L.LatLngExpression[] = route.map((p) => [p.lat, p.lng])
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
  }, [route])
  return null
}

/**
 * Al cambiar la selección, vuela con ZOOM al pin elegido (no solo pan): tocar una
 * tarjeta debe ACERCAR al punto. El momento EN JUEGO no tiene pin (issue #593): si
 * lo seleccionan desde el carrusel, no hay a dónde volar y el mapa se queda quieto.
 */
function PanToSelected({
  selectedChallengeId,
  route,
}: {
  selectedChallengeId: string | null
  route: RoutePoint[]
}) {
  const map = useMap()
  useEffect(() => {
    if (!selectedChallengeId) return
    const target = route.find((p) => p.challengeId === selectedChallengeId)
    if (!target) return
    // Zoom a nivel ciudad como mínimo; conservamos el actual si ya está más cerca.
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), SELECT_ZOOM), { duration: 0.6 })
  }, [selectedChallengeId, route, map])
  return null
}

/**
 * Mapa PLANO de la ruta del viaje (Leaflet + satélite Esri por defecto) — el "suelo"
 * garantizado del pivote (el globo 3D/MapLibre es otra tarea). Pinta:
 *  - un pin-foto circular por momento cerrado, clavado en su lat/lng;
 *  - la ruta: línea continua entre cerrados.
 *  - el momento EN JUEGO NUNCA aparece aquí (issue #593): mientras dura, su
 *    respuesta es secreta y el diario solo lo muestra en el timeline/carrusel;
 *    al cerrarse, entra en `route` con su pin real.
 */
export function TripMapLeaflet({
  route,
  selectedChallengeId,
  playing = false,
  onSelectMoment,
}: Props) {
  // Capa de fondo: SATÉLITE (Esri) por defecto (fase "nuevo enfoque"); el plano
  // claro (Positron) solo si el usuario lo pide con el toggle del chrome (opt-in).
  // No persiste: cada visita arranca en satélite, el estado de reposo del atlas.
  const [satellite, setSatellite] = useState(true)

  // Estado de carga: mientras la capa base no ha cargado sus teselas, Leaflet deja
  // el lienzo oscuro con, a veces, un pin suelto ("parece roto"). Tapamos ese hueco
  // con `MapSkeleton` hasta el evento `load` de la capa base (todas las teselas
  // visibles cargadas); entonces se funde y se desmonta.
  const [mapReady, setMapReady] = useState(false)
  const [skeletonGone, setSkeletonGone] = useState(false)

  // Si el evento `load` de la capa base no llega (ver MAP_READY_FALLBACK_MS más
  // arriba), no dejamos el spinner colgado: pasado el margen, lo damos por listo.
  useEffect(() => {
    const timer = window.setTimeout(() => setMapReady(true), MAP_READY_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [])

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

  return (
    <div className={styles.wrap}>
      <MapContainer
        center={WORLD}
        zoom={WORLD_ZOOM}
        className={styles.map}
        worldCopyJump
        attributionControl={false}
      >
        {/* Atribución (obligatoria) COLAPSADA: un botón "ⓘ" discreto en la esquina
            que despliega los créditos al pasar/tocar; nada de banda de texto a
            sangre. El glifo "ⓘ" es el prefix; el CSS oculta los créditos en reposo
            y los revela en hover/focus (`.wrap :global(.leaflet-control-attribution)`). */}
        <AttributionControl position="bottomright" prefix="ⓘ" />

        {/* Capa de fondo según el modo. `key` fuerza el remonte del TileLayer al
            alternar para que Leaflet cambie de juego de tiles sin estados raros. */}
        {satellite ? (
          <TileLayer
            key="esri"
            attribution={ESRI_SATELLITE.attribution}
            url={ESRI_SATELLITE.url}
            maxNativeZoom={ESRI_SATELLITE.maxNativeZoom}
            maxZoom={ESRI_SATELLITE.maxZoom}
            keepBuffer={6}
            updateWhenZooming={false}
            // `load` = todas las teselas visibles de la capa base cargadas → ocultar
            // el skeleton (el lienzo ya muestra el satélite, no el hueco oscuro).
            eventHandlers={{ load: () => setMapReady(true) }}
          />
        ) : (
          <TileLayer
            key="positron"
            attribution={CARTO_POSITRON.attribution}
            url={CARTO_POSITRON.url}
            maxNativeZoom={CARTO_POSITRON.maxNativeZoom}
            maxZoom={CARTO_POSITRON.maxZoom}
            keepBuffer={6}
            updateWhenZooming={false}
            eventHandlers={{ load: () => setMapReady(true) }}
          />
        )}

        {/* Etiquetas (nombres de ciudad / fronteras) sobre el satélite: capa de
            REFERENCIA Esri transparente. Es lo que sitúa los recuerdos (preset
            "diario"); sobre el plano claro (Positron) NO hace falta, ya trae sus
            propios topónimos. */}
        {satellite && (
          <TileLayer
            key="esri-labels"
            attribution={ESRI_REFERENCE_LABELS.attribution}
            url={ESRI_REFERENCE_LABELS.url}
            maxNativeZoom={ESRI_REFERENCE_LABELS.maxNativeZoom}
            maxZoom={ESRI_REFERENCE_LABELS.maxZoom}
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

        {/* Pines-foto de los momentos cerrados, clavados en su sitio real. */}
        {route.map((p) => (
          <Marker
            key={p.challengeId}
            position={[p.lat, p.lng]}
            icon={closedPinIcon(p, p.challengeId === selectedChallengeId)}
            eventHandlers={{ click: () => onSelectMoment(p.challengeId) }}
          />
        ))}

        {/* El momento EN JUEGO NO lleva pin (issue #593): mientras dura, su lugar es
            secreto y el mapa no lo revela ni siquiera flotando; solo vive en el
            timeline/carrusel. Al cerrarse entra en `route` con su pin real arriba. */}

        <FitToPins route={route} />
        <PanToSelected selectedChallengeId={selectedChallengeId} route={route} />
      </MapContainer>

      {/* Estado de carga: tapa el lienzo hasta que la capa base carga sus teselas
          (evento `load`); luego se funde y se desmonta. Evita el "parece roto". */}
      {!skeletonGone && (
        <MapSkeleton hidden={mapReady} onFadeOutEnd={() => setSkeletonGone(true)} />
      )}

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
