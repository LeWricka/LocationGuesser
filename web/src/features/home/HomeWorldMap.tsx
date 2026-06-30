import { useCallback, useEffect, useRef, useState } from 'react'
// Tipos SOLO (import type → cero coste en bundle). El runtime de maplibre entra por
// import() dinámico dentro del efecto, para que quede en su propio chunk WebGL.
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl'
import '../trip/tripPins.css'
import { PIN_MARKER_SVG } from '../trip/pinMarkers'
import type { WorldTrip } from './useWorldTrips'
import styles from './HomeWorldMap.module.css'

interface Props {
  /** Viajes con sus constelaciones de puntos (un clúster por viaje). */
  trips: WorldTrip[]
  /** Nº de viajes del usuario (caption; puede ser > trips.length si alguno no situó). */
  tripCount: number
  /** Km de todas las mini-rutas (caption). */
  totalKm: number
  /** Cargando coordenadas: globo sin pines aún (no rompe nada). */
  loading: boolean
  /** Abrir un viaje al tocar cualquiera de sus pines/etiqueta. */
  onOpenTrip: (groupId: string) => void
}

// Basemap SATÉLITE Esri World Imagery (sin API key): el globo es el HÉROE, atlas vivo.
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

// Vista de mundo: satélite PLANO a sangre (Mercator), centrado en el norte poblado.
// Dirección "satélite a sangre" (coherente con crear-reto/jugar): NO globo nocturno;
// el mapa real llena el lienzo de borde a borde y las constelaciones se posan encima.
const WORLD_CENTER: [number, number] = [10, 28]
// Suelo de zoom para que el satélite SIEMPRE llene el lienzo (sin bordes de "fin del
// mundo"). En plano, ~2.4 cubre el alto de un móvil en retrato.
const MIN_FILL_ZOOM = 2.4
const WORLD_ZOOM = 2.6
// Encuadre que abarque TODAS las constelaciones sin acercarse de más (han de convivir
// varios viajes en pantalla). Padding ASIMÉTRICO y generoso: arriba deja sitio a la topbar
// y el pie editorial; ABAJO deja libre la franja que ocupa la bandeja de viajes plegada,
// para que los pines NO queden tapados (clave de la inmersión: el satélite y sus pines mandan).
const FIT_MAX_ZOOM = 4.5
const FIT_PADDING = { top: 120, bottom: 300, left: 56, right: 56 }

// Estilo base mínimo: sin sprite/glyphs; el raster Esri se añade tras `load`.
const BASE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

type MapLibreModule = typeof import('maplibre-gl')

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** ¿Soporta el navegador WebGL? El globo MapLibre lo necesita; si no, caemos al globo
 *  evocado en CSS (la red de seguridad de la home, sin tiles). */
function hasWebGL(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return gl != null
  } catch {
    return false
  }
}

/** Centroide de un viaje (para colgar su etiqueta). */
function tripCentroid(trip: WorldTrip): [number, number] {
  const n = trip.points.length
  const lng = trip.points.reduce((s, p) => s + p.lng, 0) / n
  const lat = trip.points.reduce((s, p) => s + p.lat, 0) / n
  return [lng, lat]
}

/** Pin-foto (reusa las clases globales `lg-trip-pin*` del mapa de viaje: look idéntico).
 *  `lead` marca el momento más reciente del clúster (anillo cálido pulsante). */
function pinElement(opts: { imageUrl: string | null; lead: boolean }): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'lg-trip-pin lg-home-pin'
  if (opts.lead) el.classList.add('lg-home-pin--lead')
  if (opts.imageUrl) {
    el.style.backgroundImage = `url('${opts.imageUrl.replace(/'/g, "\\'")}')`
  } else {
    el.classList.add('lg-trip-pin--icon')
    el.innerHTML = PIN_MARKER_SVG
  }
  return el
}

/** Etiqueta serif del clúster (nombre del viaje), como en la maqueta. */
function labelElement(name: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'lg-home-cluster-label'
  el.textContent = name
  return el
}

/**
 * MAPAMUNDI satélite de la home — dirección "satélite A SANGRE" (plano Mercator,
 * NO globo nocturno; coherente con crear-reto y jugar). Cada viaje es su propia
 * CONSTELACIÓN: sus pines-foto + una mini-ruta en ORO (línea discontinua) que une
 * SOLO sus puntos, y una etiqueta serif con el nombre del viaje. NUNCA hay línea
 * entre viajes distintos. El click en cualquier pin o etiqueta abre ese viaje.
 *
 * Motor: MapLibre GL (satélite plano Esri), import dinámico (chunk aparte). Si el
 * navegador no tiene WebGL o el mapa revienta, caemos a un satélite EVOCADO en CSS
 * (relieve plano sin tiles) que mantiene el héroe visual sin romper la home.
 */
export function HomeWorldMap({ trips, tripCount, totalKm, loading, onOpenTrip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const glRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const readyRef = useRef(false)
  // WebGL no disponible → globo evocado en CSS (sin intentar cargar maplibre).
  const [webgl] = useState(() => hasWebGL())
  // Un fallo de carga/creación ocurre en un callback async (fuera de render): lo
  // guardamos y caemos al globo evocado (no re-lanzamos: la home no debe romperse).
  const [failed, setFailed] = useState(false)

  // Props en refs: el handler `load` (async) lee siempre el último valor sin recrear.
  const tripsRef = useRef(trips)
  const onOpenRef = useRef(onOpenTrip)
  useEffect(() => {
    tripsRef.current = trips
    onOpenRef.current = onOpenTrip
  })

  // Repinta marcadores (pines + etiquetas) y las mini-rutas (una capa line por viaje).
  const repaint = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || !readyRef.current) return
    const list = tripsRef.current

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    // Color de la mini-ruta desde el token ORO (el paint WebGL no entiende var()).
    // El oro ata la home con el viaje: la ruta es "lo vivo" en ambos.
    const css = getComputedStyle(map.getContainer())
    const routeColor = css.getPropertyValue('--route-gold-soft').trim() || 'rgba(217,178,90,0.5)'

    list.forEach((trip, ti) => {
      // El más reciente del clúster (orden ASC → el último) lleva el anillo cálido.
      const leadId = trip.points.length > 0 ? trip.points[trip.points.length - 1].id : null
      for (const p of trip.points) {
        const el = pinElement({ imageUrl: p.imageUrl, lead: p.id === leadId })
        el.title = p.title
        el.addEventListener('click', () => onOpenRef.current(trip.groupId))
        markersRef.current.push(new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map))
      }

      // Etiqueta del clúster, colgada del centroide (anchor abajo para flotar encima).
      const label = labelElement(trip.name)
      label.addEventListener('click', () => onOpenRef.current(trip.groupId))
      markersRef.current.push(
        new gl.Marker({ element: label, anchor: 'bottom' })
          .setLngLat(tripCentroid(trip))
          .addTo(map),
      )

      // Mini-ruta del viaje: une SOLO sus puntos (≥2). Una capa line por viaje, con
      // ids únicos (ti) para no colisionar entre clústeres. Nunca une dos viajes.
      const coords = trip.points.map((p) => [p.lng, p.lat] as [number, number])
      const srcId = `lg-home-route-${ti}`
      const layerId = `lg-home-route-line-${ti}`
      if (coords.length >= 2) {
        const data: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }
        const existing = map.getSource(srcId)
        if (existing && 'setData' in existing) {
          ;(existing as { setData: (d: typeof data) => void }).setData(data)
        } else {
          map.addSource(srcId, { type: 'geojson', data })
          map.addLayer({
            id: layerId,
            type: 'line',
            source: srcId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': routeColor,
              'line-width': 2,
              'line-dasharray': [2, 2.5],
            },
          })
        }
      }
    })
  }, [])

  // Encuadra TODAS las constelaciones (todos los puntos de todos los viajes).
  const fitToTrips = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl) return
    const pts: [number, number][] = []
    for (const t of tripsRef.current) for (const p of t.points) pts.push([p.lng, p.lat])
    if (pts.length === 0) return
    const duration = prefersReducedMotion() ? 0 : 700
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: 3.5, duration })
      return
    }
    const bounds = new gl.LngLatBounds(pts[0], pts[0])
    for (const p of pts) bounds.extend(p)
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration })
  }, [])

  // ── Montaje: crea el mapa una sola vez (import dinámico de maplibre + su CSS). ──
  useEffect(() => {
    if (!webgl) return
    const container = containerRef.current
    if (!container) return
    let disposed = false

    void (async () => {
      try {
        const gl = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (disposed) return
        glRef.current = gl

        const map = new gl.Map({
          container,
          style: BASE_STYLE,
          center: WORLD_CENTER,
          zoom: WORLD_ZOOM,
          // Suelo de zoom: el satélite PLANO siempre llena el lienzo a sangre (sin
          // globo flotando en cielo negro ni bordes de "fin del mundo").
          minZoom: MIN_FILL_ZOOM,
          attributionControl: { compact: true },
          fadeDuration: prefersReducedMotion() ? 0 : 300,
        })
        mapRef.current = map

        map.on('load', () => {
          if (disposed) return
          // Satélite PLANO a sangre (Mercator, la proyección por defecto): coherente con
          // el viaje y crear-reto. Ya NO activamos `globe` ni el cielo nocturno — el mapa
          // real llena el lienzo de borde a borde, estilo Polarsteps.
          map.addSource('basemap', {
            type: 'raster',
            tiles: [SATELLITE_URL],
            tileSize: 256,
            attribution: SATELLITE_ATTRIBUTION,
            maxzoom: 19,
          })
          map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' })
          readyRef.current = true
          repaint()
          // Encuadre TRANQUILO a tus viajes (ease corto), sin salto: el satélite
          // aparece y se asienta suave sobre el encuadre. Antes había un jumpTo que
          // alejaba de golpe y luego volaba → "salto raro" al cargar.
          fitToTrips()
        })
      } catch {
        // Import o creación del mapa falló → globo evocado (no rompemos la home).
        if (!disposed) setFailed(true)
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      glRef.current = null
    }
  }, [webgl, repaint, fitToTrips])

  // Repinta + reencuadra cuando cambian los datos (no recrea el mapa).
  useEffect(() => {
    repaint()
    if (readyRef.current) fitToTrips()
  }, [trips, repaint, fitToTrips])

  const evoked = !webgl || failed

  return (
    <section className={styles.wrap} aria-label="Mapa de tus viajes">
      <div className={styles.frame}>
        {evoked ? (
          // Globo EVOCADO (sin tiles): red de seguridad cuando no hay WebGL. Mantiene
          // el héroe visual; los pines/rutas reales viven en el motor MapLibre.
          <div className={styles.evoked} aria-hidden="true">
            <div className={`${styles.evokedGlobe} lg-home-globe-breathe`} />
          </div>
        ) : (
          <div ref={containerRef} className={styles.map} />
        )}

        {/* Caption editorial: recuento de viajes + km de las mini-rutas. */}
        <div className={styles.caption} aria-hidden={loading}>
          <p className={styles.captionName}>
            {tripCount === 1 ? '1 viaje' : `${tripCount} viajes`}
          </p>
          {totalKm > 0 && (
            <p className={styles.captionMeta}>{totalKm.toLocaleString('es-ES')} km recorridos</p>
          )}
        </div>
      </div>
    </section>
  )
}
