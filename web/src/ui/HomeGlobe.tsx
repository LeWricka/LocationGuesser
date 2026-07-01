import { useCallback, useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
// Tipos SOLO (import type → cero coste en bundle). El runtime de maplibre entra por
// import() dinámico dentro del efecto, para que quede en su propio chunk WebGL.
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl'
import { MAP_PRESETS, SCENE_GLOBE } from '../lib/mapPresets'
import { Icon } from './Icon'
import { buildHomePinElement } from '../features/trip/pinMarkers'
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
   * Encuadre del globo:
   *  - `'pins'` (por defecto): encuadra los pines (fitBounds), capado a zoom bajo para no
   *    aplanar la proyección. Para la home logueada con viajes reales.
   *  - `'world'`: vista MUNDO fija, sin fit. Para la landing, donde los pines son
   *    DECORATIVOS: garantiza el globo héroe esférico pase lo que pase con los pines.
   */
  framing?: 'pins' | 'world'
  /**
   * La hoja está extendida (cubre casi todo el globo): relajamos el render WebGL
   * (pausamos el repaint continuo) para no malgastar batería con el globo tapado.
   */
  relaxed?: boolean
  className?: string
}

const { base: SATELLITE, labels: LABELS } = MAP_PRESETS.diario

// Crédito de los tiles (mismas cadenas del preset, decodificando la entidad &copy; a "©"
// porque lo pintamos como TEXTO plano en nuestro propio popover, no como HTML). Cumple la
// atribución de Esri sin depender del control de MapLibre (que en prod dejaba una banda).
const MAP_CREDIT = [SATELLITE.attribution, LABELS?.attribution]
  .filter(Boolean)
  .join(' · ')
  .replace(/&copy;/g, '©')

// Vista inicial del globo: mundo entero centrado en la franja poblada del norte. El
// globo es interactivo (gira/zoom); este es solo el encuadre de arranque.
const WORLD_CENTER: [number, number] = [10, 25]
const WORLD_ZOOM = 1.6
const MIN_ZOOM = 0.8
// Tope DURO de zoom del globo. La proyección globo de MapLibre solo se "ve" esférica a
// zoom bajo; al pasar de ~3 se aplana en un mapa 2D (el bug que reportó el dueño en la
// deslogueada, donde los pines demo agrupados en Iberia/Italia forzaban un fit cercano
// que aplanaba el globo). Lo capamos en el PROPIO mapa (`maxZoom`), así NINGÚN camino
// —fit, easeTo, gesto del usuario o pines reales agrupados— puede aplanar la esfera.
const GLOBE_MAX_ZOOM = 2.4
// Techo al encuadrar varios pines: por debajo del tope duro, para que el fit deje aire y
// no toque el límite donde la curvatura se desvanece.
const FIT_MAX_ZOOM = 2.2
// Un solo pin: acercamos algo más, pero sin perder la curvatura del globo.
const SINGLE_ZOOM = 2.2
// Alto/ancho aproximado del pin de la home (disco + puntita + aro "lead") en px. El
// marcador se ancla por la PUNTA (base) y el disco crece HACIA ARRIBA, así que el fit
// necesita reservar ~este alto por ENCIMA de cada coordenada para que ningún disco quede
// cortado por el canto del lienzo o tapado por el chrome flotante. El aro "lead" y su
// pulso de bienvenida sobresalen un poco más: redondeamos al alza.
const PIN_HEIGHT = 56
const PIN_HALF_WIDTH = 28
// Padding asimétrico del fit, ya con el TAMAÑO DEL PIN reservado (el fit encuadra las
// COORDENADAS, no las cajas de los pines; sin este colchón el disco del pin más alto o el
// de los laterales se sale del encuadre y el lienzo lo recorta). Deja además aire arriba
// (marca/ajustes flotantes) y ABAJO extra para que el asa de la hoja que sube sobre el
// globo nunca tape el pin más bajo.
const FIT_PADDING = {
  top: 72 + PIN_HEIGHT,
  bottom: 120 + PIN_HEIGHT,
  left: 48 + PIN_HALF_WIDTH,
  right: 48 + PIN_HALF_WIDTH,
}
// Span MÍNIMO del encuadre (grados). Cuando todos los pines caen casi en el mismo punto
// (varios momentos de una misma ciudad: "Finde Madrid"), sus bounds son minúsculos y el
// fit intentaría un zoom muy cercano —capado a FIT_MAX_ZOOM, con los discos apilados en
// una columna ilegible—. Ensanchamos los bounds a este mínimo alrededor de su centro para
// que el encuadre deje aire y los pines cercanos se separen en vez de amontonarse.
const MIN_FIT_SPAN_DEG = 1.2

// Deriva del globo en reposo (grados de longitud por segundo): lento y aspiracional,
// como una Tierra que gira sola. Tan suave que no marea ni distrae de los pines, pero da
// vida al héroe. Se desactiva con `prefers-reduced-motion` y se pausa al interactuar / con
// la hoja subida.
const SPIN_DEG_PER_SEC = 3
// Tras una interacción del usuario, espera a reanudar la deriva (deja que termine de mirar).
const SPIN_RESUME_DELAY_MS = 4000

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
export function HomeGlobe({
  pins,
  onOpenPin,
  framing = 'pins',
  relaxed = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const glRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const readyRef = useRef(false)
  const [webgl] = useState(() => hasWebGL())
  // Un fallo de carga/creación ocurre en un callback async (fuera de render): lo
  // guardamos y caemos al globo evocado (no re-lanzamos: la home no debe romperse).
  const [failed, setFailed] = useState(false)
  // Crédito de tiles (Esri): plegado a un "ⓘ"; al tocar se despliega el texto.
  const [creditOpen, setCreditOpen] = useState(false)

  // Props en refs: el handler `load` (async) lee siempre el último valor sin recrear.
  const pinsRef = useRef(pins)
  const onOpenRef = useRef(onOpenPin)
  const framingRef = useRef(framing)
  useEffect(() => {
    pinsRef.current = pins
    onOpenRef.current = onOpenPin
    framingRef.current = framing
    relaxedRef.current = relaxed
  })

  // Deriva (auto-spin) del globo en reposo: hace que el héroe se sienta VIVO. La
  // gestiona el rAF de abajo; estos refs la pausan/reanudan sin recrear el mapa.
  const spinRafRef = useRef<number | null>(null)
  // Pausada (hoja subida = `relaxed`, o el usuario interactúa): NO derivar.
  const spinPausedRef = useRef(false)
  // Marca de tiempo del último frame, para que la velocidad sea constante (grados/seg)
  // independientemente del refresco de pantalla.
  const spinLastTsRef = useRef(0)
  // Valor de `relaxed` en ref: el handler `load` (async) y el montaje lo leen sin meter
  // `relaxed` en sus deps (recrear el mapa WebGL al arrastrar la hoja sería carísimo).
  const relaxedRef = useRef(relaxed)

  // Repinta los marcadores (pines-foto) desde las refs.
  const repaint = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || !readyRef.current) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    for (const pin of pinsRef.current) {
      const el = buildHomePinElement(pin)
      el.title = pin.title
      el.addEventListener('click', () => onOpenRef.current?.(pin.targetId))
      // Ancla `'bottom'` (igual que el mapa de viaje, TripMapGlobe): la PUNTA del pin se
      // clava en la coordenada y el disco crece hacia arriba. Con el ancla por defecto
      // (`'center'`) el disco quedaba centrado en la coordenada y su mitad inferior + la
      // puntita caían por debajo, de modo que un pin cerca del borde inferior del globo
      // salía CORTADO (el globo recorta su overflow); anclar por la punta lo sube dentro
      // del encuadre y hace coherente el clavado con el resto de la app.
      markersRef.current.push(
        new gl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.lng, pin.lat]).addTo(map),
      )
    }
  }, [])

  // Encuadra todos los pines (sin pines, queda el mundo entero). En modo `'world'`
  // (landing decorativa) NO encuadra: deja la vista mundo de arranque, siempre esférica.
  const fitToPins = useCallback(() => {
    if (framingRef.current === 'world') return
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
    // Extensión real de los pines.
    let minLng = pts[0][0]
    let maxLng = pts[0][0]
    let minLat = pts[0][1]
    let maxLat = pts[0][1]
    for (const [lng, lat] of pts) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    // Ensancha los bounds hasta un span mínimo alrededor de su centro: si todos los pines
    // caen casi en el mismo punto (una sola ciudad), evita el zoom "de aguja" que los
    // apilaría en columna; con el span mínimo el fit deja aire y los pines se separan.
    const midLng = (minLng + maxLng) / 2
    const midLat = (minLat + maxLat) / 2
    const half = MIN_FIT_SPAN_DEG / 2
    if (maxLng - minLng < MIN_FIT_SPAN_DEG) {
      minLng = midLng - half
      maxLng = midLng + half
    }
    if (maxLat - minLat < MIN_FIT_SPAN_DEG) {
      minLat = midLat - half
      maxLat = midLat + half
    }
    const bounds = new gl.LngLatBounds([minLng, minLat], [maxLng, maxLat])
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration })
  }, [])

  // Bucle de deriva: empuja la longitud del centro a velocidad constante (grados/seg), de
  // modo que el globo gira solo. Solo en reposo (no pausado) y sin reduced-motion. Mover el
  // CENTRO (no el bearing) mantiene el norte arriba y la esfera viva sin desorientar.
  const stopSpin = useCallback(() => {
    if (spinRafRef.current != null) {
      cancelAnimationFrame(spinRafRef.current)
      spinRafRef.current = null
    }
  }, [])
  const startSpin = useCallback(() => {
    if (prefersReducedMotion() || spinRafRef.current != null) return
    spinLastTsRef.current = 0
    const step = (ts: number) => {
      const map = mapRef.current
      if (!map || !readyRef.current || spinPausedRef.current) {
        spinRafRef.current = null
        return
      }
      // Robustez: si el motor (o un doble de test) no expone get/setCenter, no derivamos
      // en vez de reventar el rAF. La home nunca debe romperse por el adorno del globo.
      if (typeof map.getCenter !== 'function' || typeof map.setCenter !== 'function') {
        spinRafRef.current = null
        return
      }
      // Delta de tiempo → grados a avanzar este frame (velocidad constante real).
      const last = spinLastTsRef.current || ts
      spinLastTsRef.current = ts
      const dLng = (SPIN_DEG_PER_SEC * (ts - last)) / 1000
      const c = map.getCenter()
      // Envolvemos la longitud en [-180, 180): jitterless al cruzar el antimeridiano.
      let lng = c.lng + dLng
      if (lng > 180) lng -= 360
      map.setCenter([lng, c.lat])
      spinRafRef.current = requestAnimationFrame(step)
    }
    spinRafRef.current = requestAnimationFrame(step)
  }, [])

  // ── Montaje: crea el mapa una sola vez (import dinámico de maplibre + su CSS). ──
  useEffect(() => {
    if (!webgl) return
    const container = containerRef.current
    if (!container) return
    let disposed = false

    // Al interactuar: pausa la deriva y programa su reanudación tras un respiro (solo en la
    // landing decorativa; en `pins` la deriva ni arranca, así que esto es no-op allí).
    let resumeTimer: ReturnType<typeof setTimeout> | null = null
    const pauseSpinThenResume = () => {
      spinPausedRef.current = true
      stopSpin()
      if (resumeTimer != null) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        if (disposed || framingRef.current !== 'world') return
        spinPausedRef.current = false
        startSpin()
      }, SPIN_RESUME_DELAY_MS)
    }

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
          // Tope DURO: ni el fit ni un gesto del usuario pueden pasar de aquí, así la
          // esfera nunca se aplana (ver GLOBE_MAX_ZOOM).
          maxZoom: GLOBE_MAX_ZOOM,
          // SIN control de atribución de MapLibre: su modo compacto no ocultaba el texto
          // de Esri en prod (salía como banda, ver #363/#382). Sin control = imposible que
          // aparezca la banda; el crédito lo damos con nuestro propio "ⓘ" (ver render).
          attributionControl: false,
          fadeDuration: prefersReducedMotion() ? 0 : 300,
        })
        mapRef.current = map

        map.on('load', () => {
          if (disposed) return
          // Globo 3D (proyección que llegó en v4) + atmósfera noche tokenizada.
          map.setProjection({ type: 'globe' })
          applySky(map)
          // Satélite Esri (héroe) + etiquetas suaves encima (sitúan sin tapar la foto
          // aérea). Ambas capas vienen del preset `diario`: una sola fuente de verdad.
          // Sin `attribution` en las fuentes: no hay control de MapLibre que lo muestre
          // (el crédito sale de nuestro "ⓘ"). Así nada puede regenerar la banda.
          map.addSource('basemap', {
            type: 'raster',
            tiles: [SATELLITE.url],
            tileSize: 256,
            maxzoom: SATELLITE.maxNativeZoom,
          })
          map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' })
          if (LABELS) {
            map.addSource('labels', {
              type: 'raster',
              tiles: [LABELS.url],
              tileSize: 256,
              maxzoom: LABELS.maxNativeZoom,
            })
            map.addLayer({ id: 'labels', type: 'raster', source: 'labels' })
          }
          readyRef.current = true
          repaint()
          fitToPins()

          // Deriva en reposo: solo en la landing decorativa (`world`); en la home con
          // viajes reales (`pins`) el globo queda encuadrado en los pines, sin girar. Si la
          // hoja ya arranca subida (`relaxed`), no derivamos (el efecto de `relaxed` la
          // reanudará al recogerse).
          if (framingRef.current === 'world' && !relaxedRef.current) {
            spinPausedRef.current = false
            startSpin()
          }
        })

        // Interacción del usuario: pausa la deriva y la reanuda tras un respiro. Así el
        // gesto manda (no peleamos con su paneo) pero el globo vuelve a sentirse vivo.
        map.on('mousedown', pauseSpinThenResume)
        map.on('touchstart', pauseSpinThenResume)
        map.on('wheel', pauseSpinThenResume)
      } catch {
        if (!disposed) setFailed(true)
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      stopSpin()
      if (resumeTimer != null) clearTimeout(resumeTimer)
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      glRef.current = null
    }
    // `relaxed` NO va en las deps: cambia al arrastrar la hoja y recrear el mapa WebGL en
    // cada toque sería carísimo. Su efecto vive en el useEffect de abajo (pausa/reanuda la
    // deriva y el render sin recrear nada). El montaje lee su valor inicial vía `relaxedRef`.
  }, [webgl, repaint, fitToPins, startSpin, stopSpin])

  // Repinta + reencuadra cuando cambian los pines (no recrea el mapa).
  useEffect(() => {
    repaint()
    if (readyRef.current) fitToPins()
  }, [pins, repaint, fitToPins])

  // Rendimiento + deriva según la hoja. Con la hoja SUBIDA (`relaxed`) el globo queda casi
  // tapado: paramos la rotación de teselas (batería) y PAUSAMOS la deriva. Al RECOGERSE la
  // hoja (héroe a la vista de nuevo), reanudamos la deriva en la landing decorativa.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (relaxed) {
      spinPausedRef.current = true
      stopSpin()
      map.stop()
    } else if (framingRef.current === 'world') {
      spinPausedRef.current = false
      startSpin()
    }
  }, [relaxed, startSpin, stopSpin])

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
        <>
          <div ref={containerRef} className={styles.map} />
          {/* Crédito propio (NO control de MapLibre): "ⓘ" discreto que despliega el texto
              de Esri al tocar. `title` nativo como mínimo + popover visible. Cumple la
              atribución sin banda. Se monta sobre el lienzo, captura su propio click. */}
          <div className={styles.credit}>
            {creditOpen && <span className={styles.creditText}>{MAP_CREDIT}</span>}
            <button
              type="button"
              className={styles.creditButton}
              title={MAP_CREDIT}
              aria-label="Créditos del mapa"
              aria-expanded={creditOpen}
              onClick={() => setCreditOpen((v) => !v)}
            >
              <Icon icon={Info} size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
