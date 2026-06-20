import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'

interface Guess extends LatLng {
  name: string
}

interface Props {
  answer: LatLng
  votes: Guess[]
}

const answerIcon = L.divIcon({
  className: 'lg-pin',
  html: '🎯',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

const guessIcon = L.divIcon({
  className: 'lg-pin',
  html: '📍',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

// Ajusta el encuadre para que entren la ubicación real y todos los votos.
function FitBounds({ answer, votes }: Props) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = [
      [answer.lat, answer.lng],
      ...votes.map((v) => [v.lat, v.lng] as [number, number]),
    ]
    if (points.length === 1) {
      map.setView(points[0], 13)
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32] })
    }
  }, [map, answer, votes])
  return null
}

// Mini-mapa del revelado: 🎯 ubicación real + 📍 voto de cada jugador.
export function RevealMap({ answer, votes }: Props) {
  return (
    <MapContainer center={[answer.lat, answer.lng]} zoom={13} className="lg-map">
      {/* Mismo CDN rápido de CARTO que el resto de mapas (ver PlayMap). */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
        keepBuffer={4}
        updateWhenZooming={false}
      />
      <FitBounds answer={answer} votes={votes} />
      <Marker position={[answer.lat, answer.lng]} icon={answerIcon} title="Ubicación real" />
      {votes.map((v, i) => (
        <Marker key={`${v.name}-${i}`} position={[v.lat, v.lng]} icon={guessIcon} title={v.name} />
      ))}
    </MapContainer>
  )
}
