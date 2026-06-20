import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

const guessIcon = L.divIcon({
  className: 'lg-pin',
  html: '📍',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

const answerIcon = L.divIcon({
  className: 'lg-pin',
  html: '🎯',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

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

export function PlayMap({ guess, answer, locked, onPick }: Props) {
  return (
    <MapContainer center={[SPAIN.lat, SPAIN.lng]} zoom={5} className="lg-map">
      {/* CDN de CARTO (rápido, con tiles retina {r}) en vez de los tiles
          estándar de OSM, que iban lentos y se quedaban en gris al hacer zoom.
          keepBuffer precarga más tiles alrededor del viewport y
          updateWhenZooming=false evita pedir tiles intermedios durante la
          animación de zoom: menos parpadeo gris. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
        keepBuffer={4}
        updateWhenZooming={false}
      />
      <ClickHandler locked={locked} onPick={onPick} />
      <FitToReveal guess={guess} answer={answer} />
      {guess && <Marker position={[guess.lat, guess.lng]} icon={guessIcon} />}
      {answer && <Marker position={[answer.lat, answer.lng]} icon={answerIcon} />}
      {guess && answer && (
        <Polyline
          positions={[
            [guess.lat, guess.lng],
            [answer.lat, answer.lng],
          ]}
          pathOptions={{ color: '#ff453a', weight: 2, dashArray: '6 6' }}
        />
      )}
    </MapContainer>
  )
}
