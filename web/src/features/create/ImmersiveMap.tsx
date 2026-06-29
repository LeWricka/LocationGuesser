import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'
import { useReducedMotion } from '../../ui/motion'
import styles from './CreateChallengeImmersive.module.css'

// Satélite a sangre sin API key (Esri World Imagery), igual que MapPicker.
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTR =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

// Pin que CAE con rebote + halo: divIcon con la misma silueta del SVG de la
// maqueta. La animación de caída vive en el CSS (`pinDrop`); el halo late.
const fallingPin = L.divIcon({
  className: styles.leafletPin,
  html: `
    <span class="${styles.pinHalo}"></span>
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="#34506B" stroke="#fff" stroke-width="1.6"/>
      <circle cx="12" cy="9" r="2.6" fill="#fff"/>
    </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
})

interface Props {
  /** Punto marcado (la respuesta oculta); null antes de marcar. */
  value: LatLng | null
  /** Vuela/centra el mapa aquí cuando cambia (EXIF, GPS o marcar). */
  flyTo: LatLng | null
  /** Centro y zoom iniciales del mapa. */
  center: LatLng
  zoom: number
  /** Toca el mapa → marca el punto. */
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

// Al fijar/mover el punto, el mapa hace un leve zoom hacia él (flyTo animado),
// igual que la maqueta. Respeta prefers-reduced-motion (salto instantáneo).
function FlyTo({ flyTo, reduced }: { flyTo: LatLng | null; reduced: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!flyTo) return
    const target = Math.max(map.getZoom(), 15)
    if (reduced) {
      map.setView([flyTo.lat, flyTo.lng], target, { animate: false })
    } else {
      map.flyTo([flyTo.lat, flyTo.lng], target, { duration: 0.7 })
    }
  }, [flyTo, map, reduced])
  return null
}

// Mapa satélite a SANGRE (pantalla completa) del flujo inmersivo. Tocar el mapa
// marca dónde estás; el pin cae con rebote + halo y el mapa hace un leve zoom al
// punto. Reutiliza el satélite sin key de MapPicker; sin selector de capas (el
// satélite es el protagonista). Los controles de zoom de Leaflet se ocultan por
// CSS para no competir con el chrome flotante.
export function ImmersiveMap({ value, flyTo, center, zoom, onPick }: Props) {
  const reduced = useReducedMotion()
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      zoomControl={false}
      attributionControl={false}
      className={styles.map}
    >
      <TileLayer
        attribution={SATELLITE_ATTR}
        url={SATELLITE_URL}
        maxNativeZoom={19}
        maxZoom={20}
        keepBuffer={6}
        updateWhenZooming={false}
      />
      <ClickHandler onPick={onPick} />
      <FlyTo flyTo={flyTo} reduced={reduced} />
      {value && <Marker position={[value.lat, value.lng]} icon={fallingPin} />}
    </MapContainer>
  )
}
