import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
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
import { Expand, X } from 'lucide-react'
import type { LatLng } from '../../lib/geo'
import { CARTO_VOYAGER, ESRI_REFERENCE_LABELS, ESRI_SATELLITE } from '../../lib/mapPresets'
import { PlaceSearch } from './PlaceSearch'
import { Button, Icon } from '../../ui'
import styles from './MapPicker.module.css'

// Zoom razonable al elegir un resultado del buscador: ciudad/barrio, no calle
// ni país (issue #522).
const SEARCH_ZOOM = 13

// Pin del marcador: SVG de lucide (MapPin) RELLENO en vez de solo contorno —
// issue #551: un trazo fino de 2px se pierde sobre foto satélite, así que
// pasa a ser una gota sólida (fill) con anillo blanco de contraste y ~1.3x el
// tamaño anterior (30 → 40px), para leerse sobre cualquier basemap. El
// relleno sale de `currentColor` (lo fija `.lg-pin`, var(--color-accent));
// el anillo y el punto central usan `--color-on-accent` (blanco, token del
// sistema) en vez de un blanco crudo. La sombra la sigue aportando el filtro
// global `.lg-pin svg` (index.css) — no hace falta duplicarla aquí.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="currentColor" stroke="var(--color-on-accent)" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="10" r="3.1" fill="var(--color-on-accent)"/></svg>`

const pinIcon = L.divIcon({
  className: 'lg-pin',
  html: PIN_SVG,
  iconSize: [40, 40],
  iconAnchor: [20, 37],
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

// `flownRef` vive en `MapPicker` (sobrevive a que este mapa se desmonte): sin
// él, cada vez que el picker compacto ↔ pantalla completa remonta el
// `MapContainer` (issue #551), `useMap()` devuelve una instancia NUEVA, el
// efecto se re-dispara por el cambio de `map` y volvería a saltar al mismo
// `flyTo` de siempre, deshaciendo cualquier paneo manual del usuario. Comparando
// contra la referencia ya "volada" evitamos ese salto fantasma; un `flyTo`
// realmente nuevo (referencia distinta) sí vuela, sea cual sea el mapa vivo.
function Recenter({
  flyTo,
  zoom,
  flownRef,
}: {
  flyTo: LatLng | null
  zoom?: number
  flownRef: MutableRefObject<LatLng | null>
}) {
  const map = useMap()
  useEffect(() => {
    if (flyTo && flyTo !== flownRef.current) {
      map.setView([flyTo.lat, flyTo.lng], zoom ?? Math.max(map.getZoom(), 14))
      flownRef.current = flyTo
    }
    // `zoom` es una constante por instancia (SEARCH_ZOOM o undefined) y
    // `flownRef` es estable: no hace falta re-disparar el efecto por ellos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo, map])
  return null
}

// Vigía de la posición/zoom actuales del mapa (issue #551): al remontar entre
// el picker compacto y la vista a pantalla completa, cada uno arranca donde el
// otro lo dejó ("misma posición/zoom sincronizados"), sin mantener dos mapas
// vivos a la vez.
function ViewTracker({ onChange }: { onChange: (v: { center: LatLng; zoom: number }) => void }) {
  useMapEvents({
    moveend(e) {
      const map = e.target
      const c = map.getCenter()
      onChange({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() })
    },
  })
  return null
}

// Estilo de mapa (Satélite/Mapa): pastilla chrome flotante, compartida entre el
// picker compacto y la vista a pantalla completa.
function LayerToggle({ layer, onChoose }: { layer: BaseLayer; onChoose: (l: BaseLayer) => void }) {
  return (
    <div className={styles.layers} role="group" aria-label="Estilo de mapa">
      {(Object.keys(LAYERS) as BaseLayer[]).map((key) => (
        <button
          key={key}
          type="button"
          className={key === layer ? styles.layerActive : styles.layer}
          aria-pressed={key === layer}
          onClick={() => onChoose(key)}
        >
          {LAYERS[key].label}
        </button>
      ))}
    </div>
  )
}

export function MapPicker({ value, flyTo, center, zoom, onPick }: Props) {
  const [layer, setLayer] = useState<BaseLayer>(readStoredLayer)

  // flyTo INTERNO del buscador (issue #522), independiente del `flyTo` que
  // llega por props: así podemos recentrar el mapa al elegir un resultado sin
  // que el padre tenga que enterarse ni pisar su propio estado de flyTo (GPS,
  // EXIF…). Ver `Recenter` más abajo, que vigila ambas señales por separado.
  const [searchFlyTo, setSearchFlyTo] = useState<LatLng | null>(null)

  // "Ya volado a…" por señal (externa/buscador), lifted aquí para que
  // sobreviva al remonte compacto↔pantalla-completa (ver `Recenter`).
  const flownExternalRef = useRef<LatLng | null>(null)
  const flownSearchRef = useRef<LatLng | null>(null)

  // Última posición/zoom conocidos del mapa (issue #551): null hasta el primer
  // `moveend`, momento en el que el mapa arranca con `center`/`zoom` (props).
  const [view, setView] = useState<{ center: LatLng; zoom: number } | null>(null)

  // Picker a pantalla completa (issue #551): mismo mapa, mismo estado, solo
  // cambia el lienzo (portal a `document.body`, como Lightbox/Modal — un
  // `position: fixed` dentro de un ancestro con transform/backdrop-filter se
  // ancla a ESE ancestro en vez de al viewport, así que se saca a body).
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  function chooseLayer(next: BaseLayer) {
    setLayer(next)
    localStorage.setItem(LAYER_KEY, next)
  }

  // Sitio elegido en el buscador: marca el pin (vía `onPick`, igual que un
  // click en el mapa) y dispara el vuelo interno hacia ese punto.
  function onSearchSelect(point: LatLng) {
    onPick(point)
    setSearchFlyTo(point)
  }

  // Bloquea el scroll del body mientras el picker está a pantalla completa
  // (mismo patrón que Lightbox): evita el rebote de la página por detrás
  // mientras se hace pinch/drag en el mapa.
  useEffect(() => {
    if (!expanded) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [expanded])

  // Enfocar el panel al abrir + cerrar con Escape (mismo patrón que Modal).
  useEffect(() => {
    if (expanded) panelRef.current?.focus()
  }, [expanded])
  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const base = LAYERS[layer]
  const initialCenter = view?.center ?? center
  const initialZoom = view?.zoom ?? zoom

  return (
    <div className={styles.wrap}>
      {/* Buscador FUERA del lienzo (issue #551): antes flotaba dentro del mapa y
          tapaba los controles de zoom +/-; ahora es la primera fila del propio
          picker, a todo el ancho, en flujo normal. */}
      <PlaceSearch onSelect={onSearchSelect} />
      <div className={styles.canvas}>
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={initialZoom}
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
          <Recenter flyTo={flyTo} flownRef={flownExternalRef} />
          {/* Recenter independiente para el buscador: no comparte la misma prop
              (`flyTo` la controla el padre y a veces queda fija, p.ej. tras GPS),
              así que un segundo watcher garantiza que SIEMPRE vuele al elegir un
              resultado, gane quien gane la carrera de qué señal llegó última. */}
          <Recenter flyTo={searchFlyTo} zoom={SEARCH_ZOOM} flownRef={flownSearchRef} />
          <ViewTracker onChange={setView} />
          {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
        </MapContainer>
        <div className={styles.controls}>
          <LayerToggle layer={layer} onChoose={chooseLayer} />
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setExpanded(true)}
            aria-label="Ampliar mapa a pantalla completa"
            title="Ampliar mapa"
          >
            <Icon icon={Expand} size={18} />
          </button>
        </div>
      </div>

      {expanded &&
        createPortal(
          <div
            className={styles.fullscreen}
            role="dialog"
            aria-modal="true"
            aria-label="Elegir sitio en el mapa"
          >
            <div
              className={styles.fullscreenPanel}
              ref={panelRef}
              tabIndex={-1}
              // stopPropagation no hace falta: no hay overlay-clic-fuera-cierra
              // (el picker no tiene "fuera", es a pantalla completa).
            >
              <div className={styles.fullscreenTop}>
                <PlaceSearch onSelect={onSearchSelect} />
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setExpanded(false)}
                  aria-label="Cerrar mapa a pantalla completa"
                >
                  <Icon icon={X} size={20} />
                </button>
              </div>
              <div className={styles.canvas}>
                <MapContainer
                  center={[initialCenter.lat, initialCenter.lng]}
                  zoom={initialZoom}
                  className={`lg-map ${styles.mapFull}`}
                  attributionControl={false}
                >
                  <AttributionControl position="bottomright" prefix="ⓘ" />
                  <TileLayer
                    key={layer}
                    attribution={base.attribution}
                    url={base.url}
                    maxNativeZoom={19}
                    maxZoom={20}
                    keepBuffer={6}
                    updateWhenZooming={false}
                  />
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
                  <Recenter flyTo={flyTo} flownRef={flownExternalRef} />
                  <Recenter flyTo={searchFlyTo} zoom={SEARCH_ZOOM} flownRef={flownSearchRef} />
                  <ViewTracker onChange={setView} />
                  {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
                </MapContainer>
                <div className={styles.controls}>
                  <LayerToggle layer={layer} onChoose={chooseLayer} />
                </div>
              </div>
              <div className={styles.fullscreenFooter}>
                <Button size="lg" fullWidth onClick={() => setExpanded(false)}>
                  Listo
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
