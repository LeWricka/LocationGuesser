import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'

// Vista inicial: el MUNDO entero (estilo GeoGuessr). Antes arrancaba en España
// (zoom 5), lo que obligaba a alejar para buscar sitios fuera y volver a acercar.
// Empezando alejado, el jugador va de lejos a cerca directo.
const WORLD: LatLng = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

const guessIcon = L.divIcon({
  className: 'lg-pin',
  html: '📍',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

// El 🎯 (respuesta real) cae con muelle al revelar: clase extra que dispara la
// animación CSS `lg-pin-drop` (definida en index.css, respeta reduced-motion).
const answerIcon = L.divIcon({
  className: 'lg-pin lg-pin-drop',
  html: '🎯',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

const respectsMotion = () =>
  typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Props {
  /** Pin del jugador; null hasta que toca el mapa. */
  guess: LatLng | null
  /** Ubicación real; solo se pasa tras revelar (entonces se dibuja 🎯 + línea). */
  answer: LatLng | null
  /** Bloquea el clic tras revelar: el voto ya no se puede mover. */
  locked: boolean
  onPick: (p: LatLng) => void
}

// El clic solo coloca/mueve el pin mientras no esté bloqueado (pre-revelado).
function ClickHandler({ locked, onPick }: { locked: boolean; onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      if (locked) return
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Al revelar, encuadra ambos puntos (tu pin + 🎯) con margen para que se vean
// los dos con el zoom adecuado. El mapa debe estar dimensionado a su tamaño
// final antes de calcular, por eso `invalidateSize` previo al `fitBounds`.
function FitToReveal({ guess, answer }: { guess: LatLng | null; answer: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (!guess || !answer) return
    map.invalidateSize()
    const bounds = L.latLngBounds([
      [guess.lat, guess.lng],
      [answer.lat, answer.lng],
    ]).pad(0.3)
    map.fitBounds(bounds, { maxZoom: 12 })
  }, [map, guess, answer])
  return null
}

// Línea pin → 🎯 que se "dibuja" al revelar. Truco SVG: igualamos dasharray a
// la longitud del trazo y animamos dashoffset de longitud→0 con la Web
// Animations API. Sobre el path real que pinta Leaflet (Polyline). Bajo
// reduced-motion la línea aparece ya dibujada (sin animar). No altera geometría
// ni el fit-to-bounds: solo anima el trazo de un path ya posicionado.
function DrawnLine({ guess, answer }: { guess: LatLng; answer: LatLng }) {
  const lineRef = useRef<L.Polyline | null>(null)

  useEffect(() => {
    const path = lineRef.current?.getElement() as SVGPathElement | null
    if (!path || !respectsMotion() || typeof path.getTotalLength !== 'function') return
    const len = path.getTotalLength()
    if (!len) return
    const anim = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 600,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
      delay: 120,
    })
    // Igualamos el patrón de guiones a la longitud para que el offset "tape" toda
    // la línea al empezar. Lo dejamos sólido al acabar.
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
    return () => anim.cancel()
  }, [guess, answer])

  return (
    <Polyline
      ref={lineRef}
      positions={[
        [guess.lat, guess.lng],
        [answer.lat, answer.lng],
      ]}
      pathOptions={{ color: '#ff453a', weight: 3 }}
    />
  )
}

export function PlayMap({ guess, answer, locked, onPick }: Props) {
  return (
    <MapContainer
      center={[WORLD.lat, WORLD.lng]}
      zoom={WORLD_ZOOM}
      minZoom={2}
      worldCopyJump
      // Zoom rápido para llegar a un punto pequeño sin mil scrolls (nivel 1):
      // doble-clic/doble-tap acercan HACIA el punto (zoomDelta=2 → +2 niveles);
      // la rueda es más sensible (wheelPxPerZoomLevel 60→40) y zoomSnap 0.5 da
      // pasos finos para afinar al final. doubleClickZoom va de serie.
      zoomDelta={2}
      zoomSnap={0.5}
      wheelPxPerZoomLevel={40}
      className="lg-map"
    >
      {/* CDN de CARTO. Anti-gris al hacer zoom:
          - SIN retina {r}: tiles 256px (4× más ligeros) → cargan antes.
          - maxNativeZoom=19: más allá de 19 CARTO no tiene tiles; en vez de
            pedir uno inexistente (gris), Leaflet REESCALA el de 19 al instante.
          - keepBuffer precarga alrededor; updateWhenZooming=false mantiene los
            tiles viejos escalados durante la animación (no parpadea gris). */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        subdomains="abcd"
        maxNativeZoom={19}
        maxZoom={20}
        keepBuffer={6}
        updateWhenZooming={false}
      />
      <ClickHandler locked={locked} onPick={onPick} />
      <FitToReveal guess={guess} answer={answer} />
      {guess && <Marker position={[guess.lat, guess.lng]} icon={guessIcon} />}
      {answer && <Marker position={[answer.lat, answer.lng]} icon={answerIcon} />}
      {guess && answer && <DrawnLine guess={guess} answer={answer} />}
    </MapContainer>
  )
}
