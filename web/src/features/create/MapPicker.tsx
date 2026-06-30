import { useEffect, useState } from 'react'
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/geo'
import { CARTO_VOYAGER, ESRI_REFERENCE_LABELS, ESRI_SATELLITE } from '../../lib/mapPresets'
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

// Capas base sin API key, centralizadas en `mapPresets`. Satélite (por defecto) =
// Esri World Imagery; el callejero etiquetado (CARTO Voyager, el basemap del preset
// "jugar") queda como alternativa. El satélite lleva además la capa de etiquetas
// para situar el punto (igual que el diario); el callejero ya trae sus topónimos.
type BaseLayer = 'street' | 'satellite'

const LAYERS: Record<BaseLayer, { label: string; url: string; attribution: string }> = {
  satellite: {
    label: 'Satélite',
    url: ESRI_SATELLITE.url,
    attribution: ESRI_SATELLITE.attribution,
  },
  street: {
    label: 'Mapa',
    url: CARTO_VOYAGER.url,
    attribution: CARTO_VOYAGER.attribution,
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
        attributionControl={false}
      >
        {/* Atribución (obligatoria) COLAPSADA: un botón "ⓘ" discreto en la esquina
            en vez de la banda "Leaflet | Tiles © Esri…" a sangre. El glifo "ⓘ" es el
            prefix; el CSS oculta los créditos en reposo y los revela en hover/focus
            (mismo patrón que los mapas del viaje). */}
        <AttributionControl position="bottomright" prefix="ⓘ" />
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
        {/* Etiquetas (nombres de ciudad) sobre el satélite: capa de referencia Esri
            transparente, para situar el punto. El callejero ya trae sus topónimos. */}
        {layer === 'satellite' && (
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
        <ClickHandler onPick={onPick} />
        <Recenter flyTo={flyTo} />
        {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
      </MapContainer>
    </div>
  )
}
