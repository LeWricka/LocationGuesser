import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet'
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

export function PlayMap({ guess, answer, locked, onPick }: Props) {
  return (
    <MapContainer center={[SPAIN.lat, SPAIN.lng]} zoom={5} className="lg-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler locked={locked} onPick={onPick} />
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
