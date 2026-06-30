import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'
import styles from './MapPicker.module.css'

// Pin del marcador como SVG de lucide (MapPin) en vez de emoji: unifica el marker
// con el resto del set de iconos (mismo trazo y color por token). El color sale de
// `currentColor`, que fija `.lg-pin` (var --color-accent), y la sombra lo despega
// de la foto satélite.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`

const pinIcon = L.divIcon({
  className: 'lg-pin',
  html: PIN_SVG,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
})

// Capas base sin API key. Satélite (por defecto) = Esri World Imagery; el
// callejero (CARTO Voyager) queda como alternativa. El usuario pidió SATÉLITE por
// defecto: el gris del callejero es soso y la foto aérea hace el mapa vivo.
type BaseLayer = 'street' | 'satellite'

const LAYERS: Record<BaseLayer, { label: string; url: string; attribution: string }> = {
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  street: {
    label: 'Mapa',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
}

const LAYER_KEY = 'lg.mapLayer'

// Satélite por defecto (preferencia del usuario). Solo respetamos lo guardado si
// el usuario eligió explícitamente "Mapa"; cualquier otro valor cae a satélite.
function readStoredLayer(): BaseLayer {
  const v = localStorage.getItem(LAYER_KEY)
  return v === 'street' ? 'street' : 'satellite'
}

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
  const [layer, setLayer] = useState<BaseLayer>(readStoredLayer)

  function chooseLayer(next: BaseLayer) {
    setLayer(next)
    localStorage.setItem(LAYER_KEY, next)
  }

  const base = LAYERS[layer]

  return (
    <div className={styles.wrap}>
      <div className={styles.layers} role="group" aria-label="Estilo de mapa">
        {(Object.keys(LAYERS) as BaseLayer[]).map((key) => (
          <button
            key={key}
            type="button"
            className={key === layer ? styles.layerActive : styles.layer}
            aria-pressed={key === layer}
            onClick={() => chooseLayer(key)}
          >
            {LAYERS[key].label}
          </button>
        ))}
      </div>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className={`lg-map ${styles.map}`}
      >
        {/* keepBuffer + updateWhenZooming reducen el parpadeo gris al hacer
            zoom (mismo motivo que en PlayMap). Sin `subdomains` porque la capa
            satélite (Esri) no usa el placeholder {s}. */}
        <TileLayer
          key={layer}
          attribution={base.attribution}
          url={base.url}
          maxNativeZoom={19}
          maxZoom={20}
          keepBuffer={6}
          updateWhenZooming={false}
        />
        <ClickHandler onPick={onPick} />
        <Recenter flyTo={flyTo} />
        {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
      </MapContainer>
    </div>
  )
}
