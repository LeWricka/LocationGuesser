import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ESRI_REFERENCE_LABELS, ESRI_SATELLITE, SINGLE_ZOOM } from '../../lib/mapPresets'
import { PIN_MARKER_SVG } from './pinMarkers'
import styles from './MomentMiniMap.module.css'

interface Props {
  /** Coordenada real del momento (recuerdo con lugar o reto ya cerrado). */
  lat: number
  lng: number
}

// Pin clavado en la coordenada del momento: disco oscuro con el glifo MapPin (lucide).
// El color sale del token aplicado por el module (`.pin`); el SVG usa currentColor.
const pinIcon: L.DivIcon = L.divIcon({
  className: '',
  html: `<span class="${styles.pin}">${PIN_MARKER_SVG}</span>`,
  iconSize: [40, 40],
  iconAnchor: [20, 38],
})

/**
 * Mini-mapa REAL del detalle del momento ("En el mapa"). Sustituye al blob abstracto
 * de CSS que no decía nada: un Leaflet estático (no interactivo) centrado en las
 * coordenadas reales con el pin, usando el preset "diario" (satélite Esri + etiquetas)
 * para que se vea de verdad DÓNDE es. El encuadre (SINGLE_ZOOM = ciudad) sale del
 * mismo preset que el mapa del diario, así que el detalle y el diario se ven igual.
 *
 * Sin controles: el usuario no navega aquí, solo SITÚA el recuerdo; los gestos quedan
 * desactivados para que el scroll de la hoja no se "trague" arrastrando el mapa.
 */
export function MomentMiniMap({ lat, lng }: Props) {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <MapContainer
        center={[lat, lng]}
        zoom={SINGLE_ZOOM}
        className={styles.map}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <TileLayer
          attribution={ESRI_SATELLITE.attribution}
          url={ESRI_SATELLITE.url}
          maxNativeZoom={ESRI_SATELLITE.maxNativeZoom}
          maxZoom={ESRI_SATELLITE.maxZoom}
        />
        <TileLayer
          attribution={ESRI_REFERENCE_LABELS.attribution}
          url={ESRI_REFERENCE_LABELS.url}
          maxNativeZoom={ESRI_REFERENCE_LABELS.maxNativeZoom}
          maxZoom={ESRI_REFERENCE_LABELS.maxZoom}
        />
        <Marker position={[lat, lng]} icon={pinIcon} interactive={false} />
      </MapContainer>
    </div>
  )
}
