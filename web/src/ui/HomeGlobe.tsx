import { useCallback, useEffect, useRef, useState } from 'react'
// Tipos SOLO (import type → cero coste en bundle). El runtime de maplibre entra por
// import() dinámico dentro del efecto, para que quede en su propio chunk WebGL.
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl'
import { MAP_PRESETS, SCENE_GLOBE } from '../lib/mapPresets'
import { photoPinHtml } from '../features/trip/pinMarkers'
import '../features/trip/tripPins.css'
import styles from './HomeGlobe.module.css'

/** Un pin-foto del globo de la home: una coordenada con miniatura y a qué viaje abre. */
export interface GlobePin {
  /** Clave estable del pin. */
  id: string
  lat: number
  lng: number
  /** Texto accesible del pin (título del momento o del viaje). */
  title: string
  /** Miniatura del pin, o null (cae a un marcador de ubicación genérico). */
  imageUrl: string | null
  /** Id del destino al tocar el pin (el viaje que abre). */
  targetId: string
  /** Marca el pin "lead" del grupo (anillo cálido pulsante). */
  lead?: boolean
}

interface Props {
  /** Pines-foto a clavar en el globo. */
  pins: GlobePin[]
  /** Tocar un pin → abre su destino (un viaje). */
  onOpenPin?: (targetId: string) => void
  /**
   * La hoja está extendida (cubre casi todo el globo): relajamos el render WebGL
   * (pausamos el repaint continuo) para no malgastar batería con el globo tapado.
   */
  relaxed?: boolean
  className?: string
}

const { base: SATELLITE, labels: LABELS } = MAP_PRESETS.diario

// Vista inicial del globo: mundo entero centrado en la franja poblada del norte. El
// globo es interactivo (gira/zoom); este es solo el encuadre de arranque.
const WORLD_CENTER: [number, number] = [10, 25]
const WORLD_ZOOM = 1.6
const MIN_ZOOM = 0.8
// Techo al encuadrar varios pines: deliberadamente BAJO. La proyección globo de MapLibre
// solo se "ve" esférica a zoom bajo; al pasar de ~3 se aplana en un mapa 2D (el bug que
// reportó el dueño en la deslogueada, donde los pines demo agrupados en Iberia/Italia
// forzaban un fit cercano que aplanaba el globo). Capamos en 2.6 para que SIEMPRE se lea
// como globo héroe, agrupados o no.
const FIT_MAX_ZOOM = 2.6
// Un solo pin: acercamos algo más, pero sin perder la curvatura del globo.
const SINGLE_ZOOM = 2.4
// Padding asimétrico: deja aire arriba (marca/ajustes flotantes) y abajo (asa de la
// hoja que sube sobre el globo), para que los pines no queden tapados.
const FIT_PADDING = { top: 72, bottom: 120, left: 48, right: 48 }

// Estilo base mínimo: sin sprite/glyphs; los rasters se añaden tras `load`.
const BASE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

type MapLibreModule = typeof import('maplibre-gl')

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** ¿Soporta el navegador WebGL? Sin él caemos al globo evocado en CSS (red de seguridad). */
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

/** Pin-foto del globo de la home: el MISMO markup que el mapa de viaje
 * (`photoPinHtml`: círculo con foto + puntita inferior; sin foto = disco de acento con
 * la inicial del lugar). Le añadimos `lg-home-pin` para compactarlo y `lg-home-pin--lead`
 * para el anillo cálido pulsante del pin "lead". El borde/look lo gobiernan los tokens. */
function pinElement(pin: GlobePin): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = photoPinHtml({ imageUrl: pin.imageUrl, title: pin.title })
  // El primer (único) hijo es el `.lg-trip-pin`; lo devolvemos como elemento del Marker.
  const el = wrapper.firstElementChild as HTMLDivElement
  el.classList.add('lg-home-pin')
  if (pin.lead) el.classList.add('lg-home-pin--lead')
  return el
}

// Aplica atmósfera/cielo NOCHE al globo (colores de escena tokenizados en mapPresets;
// el paint WebGL no entiende var(--token), por eso vienen de SCENE_GLOBE). Feature-detect
// estricto: si la versión de maplibre no soporta la API, se omite sin romper el globo.
function applySky(map: MapLibreMap): void {
  const withSky = map as MapLibreMap & {
    setSky?: (sky: Record<string, unknown>) => unknown
    setFog?: (fog: Record<string, unknown>) => unknown
  }
  if (typeof withSky.setSky === 'function') {
    try {
      withSky.setSky({
        'sky-color': SCENE_GLOBE.skyColor,
        'horizon-color': SCENE_GLOBE.horizonColor,
        'sky-horizon-blend': 0.6,
        'atmosphere-blend': 0.7,
      })
    } catch {
      // Versión sin soporte real: omitir.
    }
  }
  if (typeof withSky.setFog === 'function') {
    try {
      withSky.setFog({ color: SCENE_GLOBE.fogColor, 'horizon-blend': 0.2 })
    } catch {
      // No disponible: ignorar.
    }
  }
}

/**
 * Globo HÉROE de la home — patrón "globo + hoja" (referencia Polarsteps). Reutiliza
 * el motor MapLibre GL con el preset `diario` (satélite Esri + etiquetas) y la proyección
 * GLOBO, los mismos pines-foto del mapa de viaje y la paleta de escena tokenizada.
 *
 * Es INTERACTIVO (gira/zoom) y sus pines-foto son TOCABLES (abren su viaje). Vive en su
 * propia zona superior: los gestos de paneo/zoom quedan aquí y la hoja, encima, lleva su
 * propio scroll (separación de gestos, no pelean). Si no hay WebGL o el mapa revienta,
 * cae a un globo evocado en CSS que mantiene el héroe visual sin romper la home.
 */
export function HomeGlobe({ pins, onOpenPin, relaxed = false, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const glRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const readyRef = useRef(false)
  const [webgl] = useState(() => hasWebGL())
  // Un fallo de carga/creación ocurre en un callback async (fuera de render): lo
  // guardamos y caemos al globo evocado (no re-lanzamos: la home no debe romperse).
  const [failed, setFailed] = useState(false)

  // Props en refs: el handler `load` (async) lee siempre el último valor sin recrear.
  const pinsRef = useRef(pins)
  const onOpenRef = useRef(onOpenPin)
  useEffect(() => {
    pinsRef.current = pins
    onOpenRef.current = onOpenPin
  })

  // Repinta los marcadores (pines-foto) desde las refs.
  const repaint = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || !readyRef.current) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    for (const pin of pinsRef.current) {
      const el = pinElement(pin)
      el.title = pin.title
      el.addEventListener('click', () => onOpenRef.current?.(pin.targetId))
      markersRef.current.push(
        new gl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map),
      )
    }
  }, [])

  // Encuadra todos los pines (sin pines, queda el mundo entero).
  const fitToPins = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl) return
    const pts = pinsRef.current.map((p) => [p.lng, p.lat] as [number, number])
    if (pts.length === 0) return
    const duration = prefersReducedMotion() ? 0 : 700
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: SINGLE_ZOOM, duration })
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
          minZoom: MIN_ZOOM,
          // Desactivamos el control por defecto y lo añadimos instanciado a mano (abajo):
          // pasarlo como opción-objeto NO entraba en modo compacto fiablemente en prod
          // (se veía el texto completo de Esri como banda, no el "ⓘ").
          attributionControl: false,
          fadeDuration: prefersReducedMotion() ? 0 : 300,
        })
        mapRef.current = map

        // Atribución COLAPSADA de verdad: instanciar `AttributionControl` con
        // `compact: true` es la forma documentada y fiable de obtener el "ⓘ" que expande
        // al tocar (el control sí recibe la clase `maplibregl-compact` que estiliza el CSS).
        map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-right')

        map.on('load', () => {
          if (disposed) return
          // Globo 3D (proyección que llegó en v4) + atmósfera noche tokenizada.
          map.setProjection({ type: 'globe' })
          applySky(map)
          // Satélite Esri (héroe) + etiquetas suaves encima (sitúan sin tapar la foto
          // aérea). Ambas capas vienen del preset `diario`: una sola fuente de verdad.
          map.addSource('basemap', {
            type: 'raster',
            tiles: [SATELLITE.url],
            tileSize: 256,
            attribution: SATELLITE.attribution,
            maxzoom: SATELLITE.maxNativeZoom,
          })
          map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' })
          if (LABELS) {
            map.addSource('labels', {
              type: 'raster',
              tiles: [LABELS.url],
              tileSize: 256,
              attribution: LABELS.attribution,
              maxzoom: LABELS.maxNativeZoom,
            })
            map.addLayer({ id: 'labels', type: 'raster', source: 'labels' })
          }
          readyRef.current = true
          repaint()
          fitToPins()
        })
      } catch {
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
  }, [webgl, repaint, fitToPins])

  // Repinta + reencuadra cuando cambian los pines (no recrea el mapa).
  useEffect(() => {
    repaint()
    if (readyRef.current) fitToPins()
  }, [pins, repaint, fitToPins])

  // Rendimiento: con la hoja extendida el globo queda casi tapado. Pausamos la rotación
  // de teselas (stop) para no malgastar batería con WebGL bajo la hoja; al recogerse la
  // hoja, el render se reanuda solo en la siguiente interacción/cambio.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (relaxed) map.stop()
  }, [relaxed])

  const evoked = !webgl || failed

  return (
    <div className={[styles.globe, className].filter(Boolean).join(' ')} aria-hidden="true">
      {evoked ? (
        // Globo EVOCADO (sin tiles): red de seguridad cuando no hay WebGL. Mantiene
        // el héroe visual; los pines reales viven en el motor MapLibre.
        <div className={styles.evoked}>
          <div className={`${styles.evokedGlobe} lg-home-globe-breathe`} />
        </div>
      ) : (
        <div ref={containerRef} className={styles.map} />
      )}
    </div>
  )
}
