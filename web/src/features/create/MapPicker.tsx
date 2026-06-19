import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'

const pinIcon = L.divIcon({
  className: 'lg-pin',
  html: '📍',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

interface Props {
  value: LatLng | null
  flyTo: LatLng | null
  center: LatLng
  zoom: number
  onPick: (p: LatLng) => void
}

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

function Recenter({ flyTo }: { flyTo: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.setView([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 14))
  }, [flyTo, map])
  return null
}

export function MapPicker({ value, flyTo, center, zoom, onPick }: Props) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className="lg-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <Recenter flyTo={flyTo} />
      {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
    </MapContainer>
  )
}
