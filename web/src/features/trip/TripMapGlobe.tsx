import { useCallback, useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
// Tipos SOLO (import type → cero coste en bundle). El runtime entra por import()
// dinámico dentro del efecto para que maplibre quede en un chunk aparte.
import type {
  MapLibreMap,
  Marker as MapLibreMarker,
  SkySpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { RoutePoint } from '../../lib/trip'
import {
  ESRI_REFERENCE_LABELS,
  ESRI_SATELLITE,
  FIT_MAX_ZOOM,
  SCENE_GLOBE,
  SELECT_ZOOM,
  SINGLE_ZOOM,
} from '../../lib/mapPresets'
import { Icon } from '../../ui/Icon'
import { MapSkeleton } from '../../ui/MapSkeleton'
import type { TripMapProps as Props } from './TripMap.types'
import { buildActivePinElement, buildPinElement } from './pinMarkers'
import { drawnRouteCount } from './routeDraw'
import './tripPins.css'
import styles from './TripMapGlobe.module.css'

// Crédito de los tiles (mismas cadenas del preset, decodificando &copy; a "©" porque lo
// pintamos como TEXTO plano en nuestro propio popover, no como HTML). Cumple la atribución
// de Esri sin depender del control de MapLibre (que en prod dejaba una banda, #363/#382).
const MAP_CREDIT = [ESRI_SATELLITE.attribution, ESRI_REFERENCE_LABELS.attribution]
  .join(' · ')
  .replace(/&copy;/g, '©')

// Basemap SATÉLITE + capa de ETIQUETAS (preset "diario", centralizado en
// `mapPresets`): Esri World Imagery sin API key con los nombres de ciudad
// superpuestos. El satélite hace el globo "héroe" (atlas vivo) y las etiquetas
// sitúan los recuerdos. tileSize 256 es lo que sirve Esri; va en globo.

// Centro/zoom del mundo hasta que fitBounds encuadra los pines (paridad con el plano).
const WORLD_CENTER: [number, number] = [0, 25]
const WORLD_ZOOM = 1.4

// Encuadre de pines (centralizado en `mapPresets`, compartido con el plano para que
// globo y fallback coincidan). FIT_PADDING deja hueco al chrome (arriba) y al
// carrusel (abajo); top y bottom mayores que los lados.
const FIT_PADDING = { top: 88, bottom: 220, left: 48, right: 48 }
// Suelo de zoom para que el satélite llene el lienzo (sin esfera flotando en el espacio).
// ~3.2 cubre el alto de un móvil en retrato con la proyección globo.
const MIN_FILL_ZOOM = 3.2

// Entrada cinematográfica (Fase 2): arrancamos un punto MÁS lejos que WORLD_ZOOM
// (vista de globo entero) y "aterrizamos" en el encuadre de la ruta. Duración corta
// para que sea un gesto, no una espera. Con reduced-motion no se usa (salto directo).
const INTRO_START_ZOOM = 0.6
const INTRO_DURATION = 1500

// Red de seguridad del skeleton: si el `idle` de MapLibre nunca llega (motor que
// no lo soporta bien, teselas que fallan en bucle, o un doble de mapa en tests/
// galería que solo emite `load`), el skeleton no debe quedar pegado para siempre
// tapando el globo con un spinner sin salida (bug #500: "spinner desnudo"). Pasado
// este margen, lo damos por listo igual — el satélite real ya habrá pintado algo.
const MAP_READY_FALLBACK_MS = 4000

// Ids de fuente/capa de la ruta (line). Constantes para añadir/quitar sin colisión.
const ROUTE_SRC = 'lg-route'
const ROUTE_LINE = 'lg-route-line'
const PENDING_SRC = 'lg-route-pending'
const PENDING_LINE = 'lg-route-pending-line'
const DASH_SRC = 'lg-route-dash'
const DASH_LINE = 'lg-route-dash-line'

// Estilo base mínimo: sin sprite/glyphs (no usamos labels) y solo el raster Esri.
// Vacío de capas; el raster se añade tras `load` para poder activar el globo antes.
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
}

/**
 * Posición FLOTANTE del momento activo (anti-spoiler): el centroide de los
 * cerrados, o el centro del mundo si aún no hay ninguno. IDÉNTICO criterio que el
 * mapa plano (`TripMapLeaflet`), para que globo y fallback coincidan.
 */
function floatingActivePos(route: RoutePoint[]): [number, number] {
  if (route.length === 0) return WORLD_CENTER
  const lat = route.reduce((s, p) => s + p.lat, 0) / route.length
  const lng = route.reduce((s, p) => s + p.lng, 0) / route.length
  return [lng, lat]
}

/** Crea el ELEMENTO DOM de un pin-foto (cerrado o activo) para el Marker de MapLibre.
 * Reusa los builders compartidos (`pinMarkers`) y las clases del plano (`lg-trip-pin*`)
 * para que el look —miniatura redonda + borde + puntita + pulso— sea idéntico en ambos
 * motores; el color del borde lo gobiernan los tokens, no se hardcodea. El pin CERRADO
 * pasa por `buildPinElement`, que precarga la foto y solo la sube si carga de verdad
 * (una URL firmada caducada/404 cae a la inicial en vez de dejar un recuadro oscuro). */
function pinElement(opts: {
  imageUrl: string | null
  title?: string | null
  active: boolean
  featured?: boolean
}): HTMLDivElement {
  return opts.active
    ? buildActivePinElement()
    : buildPinElement({ imageUrl: opts.imageUrl, title: opts.title, featured: opts.featured })
}

/**
 * Mapa GLOBO 3D de la ruta (MapLibre GL + proyección globo + basemap SATÉLITE Esri
 * World Imagery). Es el "hero" estilo atlas editorial; el mapa plano
 * (`TripMapLeaflet`) queda de red de seguridad y `TripMap` decide cuál montar.
 * Mismo contrato de Props que el plano:
 *  - pin-foto clavado por momento cerrado (anillo blanco);
 *  - momento activo FLOTANDO sobre el centroide (anillo cálido pulsante, anti-spoiler);
 *  - ruta: línea continua entre cerrados + tramo discontinuo hacia el activo;
 *  - fitBounds inicial, flyTo al cambiar la selección, click → onSelectMoment.
 *
 * Cualquier fallo de runtime se propaga al ErrorBoundary del selector, que cae al
 * plano. Por eso aquí no tragamos errores: que suban.
 */
// Módulo de maplibre-gl resuelto. maplibre-gl@5 exporta nombres (no `default`):
// guardamos el namespace entero y usamos los constructores que necesitamos
// (Map, Marker, LngLatBounds). Sin `any`.
type MapLibreModule = typeof import('maplibre-gl')

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Atmósfera del globo: con basemap SATÉLITE el azul noche encaja — el globo se lee
// como una esfera en el espacio, con cielo oscuro y halo atmosférico azulado en el
// borde. Son colores de PAINT de MapLibre (no CSS), así que no pueden ser
// `var(--token)`; salen de `SCENE_GLOBE` (mapPresets), el único sitio con esos
// valores de escena para no volver a hardcodear `#0d1722` en un componente.
const GLOBE_SKY: SkySpecification = {
  'sky-color': SCENE_GLOBE.skyColor, // cielo: noche profunda (espacio tras el globo)
  'horizon-color': SCENE_GLOBE.horizonColor, // horizonte: pizarra que ilumina el borde
  'sky-horizon-blend': 0.6,
  'atmosphere-blend': 0.7, // halo atmosférico marcado sobre el satélite
}

// Aplica atmósfera/cielo SOLO si la versión de maplibre soporta la API. Feature-detect
// estricto: si `setSky` no existe, se omite sin lanzar (degradación elegante). Lo mismo
// con `setFog` (API de Mapbox que maplibre-gl puede no exponer): se intenta como mejora
// extra y cualquier fallo se traga — nunca debe tumbar el globo que ya funciona.
function applySky(map: MapLibreMap): void {
  const withSky = map as MapLibreMap & {
    setSky?: (sky: SkySpecification) => unknown
    setFog?: (fog: Record<string, unknown>) => unknown
  }
  if (typeof withSky.setSky === 'function') {
    try {
      withSky.setSky(GLOBE_SKY)
    } catch {
      // Versión sin soporte real pese a existir el método: omitir, no romper.
    }
  }
  if (typeof withSky.setFog === 'function') {
    try {
      // Niebla atmosférica azul noche hacia el horizonte (refuerza la curvatura del
      // globo satélite). Opcional: si la versión la ignora o falla, da igual.
      withSky.setFog({ color: SCENE_GLOBE.fogColor, 'horizon-blend': 0.2 })
    } catch {
      // No disponible/aceptada: ignorar.
    }
  }
}

export function TripMapGlobe({
  route,
  activeMoment,
  selectedChallengeId,
  playing = false,
  onSelectMoment,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const glRef = useRef<MapLibreModule | null>(null)
  // Marcadores vivos para limpiarlos antes de repintar (no acumular DOM huérfano).
  const markersRef = useRef<MapLibreMarker[]>([])
  // Señal de que el estilo cargó: los efectos de pintado esperan a esto.
  const readyRef = useRef(false)
  // La entrada cinematográfica corre UNA sola vez por montaje. Tras ella, el encuadre
  // lo gobiernan los datos/selección como siempre.
  const introDoneRef = useRef(false)
  // Un fallo al cargar/crear el mapa ocurre en un callback async, fuera del render,
  // así que el ErrorBoundary del selector NO lo vería. Lo guardamos en estado y lo
  // RE-LANZAMOS en render para que el boundary caiga al mapa plano (red de seguridad).
  const [initError, setInitError] = useState<unknown>(null)
  if (initError) throw initError
  // Crédito de tiles (Esri): plegado a un "ⓘ"; al tocar se despliega el texto.
  const [creditOpen, setCreditOpen] = useState(false)
  // Estado de carga: mientras el satélite no ha PINTADO sus teselas, el lienzo se
  // ve casi negro con, a veces, un pin suelto ("parece roto"). Tapamos ese hueco
  // con `MapSkeleton` (fondo de escena + textura + spinner) hasta el primer `idle`
  // de MapLibre (todas las teselas del encuadre cargadas y sin transiciones). Al
  // llegar, lo marcamos oculto y se funde; `skeletonGone` lo desmonta al terminar.
  const [mapReady, setMapReady] = useState(false)
  const [skeletonGone, setSkeletonGone] = useState(false)
  // Timer de la red de seguridad de `mapReady` (ver MAP_READY_FALLBACK_MS): se
  // limpia tanto si `idle` llega a tiempo como al desmontar.
  const readyFallbackRef = useRef<number | null>(null)

  // Props en refs: así las funciones de pintado (que el handler `load` invoca de
  // forma asíncrona) leen SIEMPRE el último valor, sin recrear el mapa ni arrastrar
  // closures obsoletas si los datos cambian antes de que el estilo cargue. La
  // escritura va en un efecto (no en render) para no romper la regla de hooks.
  const routeRef = useRef(route)
  const activeRef = useRef(activeMoment)
  const selectedRef = useRef(selectedChallengeId)
  const playingRef = useRef(playing)
  const onSelectRef = useRef(onSelectMoment)
  useEffect(() => {
    routeRef.current = route
    activeRef.current = activeMoment
    selectedRef.current = selectedChallengeId
    playingRef.current = playing
    onSelectRef.current = onSelectMoment
  })

  // Repinta marcadores + ruta desde las refs. Estable (useCallback) para usarla en
  // el handler `load` y en el efecto de datos sin recrear el mapa.
  const repaint = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || !readyRef.current) return
    const pts = routeRef.current
    const active = activeRef.current

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    // Pines de cerrados, clavados en su lat/lng real. `anchor: 'bottom'` ancla la
    // PUNTA del pin a la coordenada (el círculo queda arriba), igual que el plano.
    const selected = selectedRef.current
    for (const p of pts) {
      const el = pinElement({
        imageUrl: p.imageUrl,
        title: p.title,
        active: false,
        featured: p.challengeId === selected,
      })
      el.addEventListener('click', () => onSelectRef.current(p.challengeId))
      markersRef.current.push(
        new gl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map),
      )
    }

    // Pin del momento activo: FLOTANDO sobre el centroide (nunca su sitio real).
    if (active) {
      const el = pinElement({ imageUrl: null, active: true })
      el.addEventListener('click', () => onSelectRef.current(active.challengeId))
      markersRef.current.push(
        new gl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(floatingActivePos(pts))
          .addTo(map),
      )
    }

    // Ruta en ORO (token): el oro marca el recorrido "vivo". El paint WebGL no entiende
    // `var(--token)`, así que resolvemos el token a color concreto leyendo la variable
    // computada (mismo valor que usa el plano por CSS). El fallback solo aplica si el
    // token faltara. Dos colores: oro sólido (recorrido) y oro tenue (pendiente/activo).
    const css = getComputedStyle(map.getContainer())
    const goldColor = css.getPropertyValue('--route-gold').trim() || '#d9b25a'
    const goldSoft = css.getPropertyValue('--route-gold-soft').trim() || 'rgba(217,178,90,0.5)'
    const closed: [number, number][] = pts.map((p) => [p.lng, p.lat])

    // DIBUJADO POR ETAPAS en play: oro sólido hasta el seleccionado, oro tenue después
    // (paridad con el plano vía la lógica pura compartida). En reposo se ve entera.
    const drawnCount = drawnRouteCount(pts, selectedRef.current, playingRef.current)
    const drawn = closed.slice(0, drawnCount)
    const pending = drawnCount < closed.length ? closed.slice(Math.max(drawnCount - 1, 0)) : []

    // Tramo discontinuo del último cerrado hacia el activo flotante.
    const dash: [number, number][] | null =
      active && pts.length > 0
        ? [[pts[pts.length - 1].lng, pts[pts.length - 1].lat], floatingActivePos(pts)]
        : null

    upsertLine(map, ROUTE_SRC, ROUTE_LINE, drawn.length >= 2 ? drawn : [], { color: goldColor })
    upsertLine(map, PENDING_SRC, PENDING_LINE, pending.length >= 2 ? pending : [], {
      color: goldSoft,
      dash: [2, 4],
    })
    upsertLine(map, DASH_SRC, DASH_LINE, dash ?? [], { color: goldSoft, dash: [2, 2.5] })
  }, [])

  // Encuadra todos los pines (cerrados + posición flotante del activo).
  const fitToPins = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl) return
    const pts: [number, number][] = routeRef.current.map((p) => [p.lng, p.lat])
    if (activeRef.current) pts.push(floatingActivePos(routeRef.current))
    if (pts.length === 0) return
    const duration = prefersReducedMotion() ? 0 : 600
    if (pts.length === 1) {
      // Un solo punto: zoom de ciudad (no de continente). fitBounds con un único
      // punto degenera en un zoom máximo absurdo, así que centramos a mano.
      map.easeTo({ center: pts[0], zoom: SINGLE_ZOOM, duration })
      return
    }
    const bounds = new gl.LngLatBounds(pts[0], pts[0])
    for (const p of pts) bounds.extend(p)
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration })
  }, [])

  // Entrada cinematográfica: arranca en vista de globo (bien lejos) y "aterriza" en
  // el encuadre de la ruta con un vuelo suave. Una sola vez por montaje. Con
  // reduced-motion NO anima: salta directo al encuadre (respeta la preferencia).
  // Si algo impide el vuelo, cae a `fitToPins` (que ya es seguro). Devuelve true si
  // hizo el vuelo (para que el handler `load` no llame además a `fitToPins`).
  const introFlight = useCallback((): boolean => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl) return false
    if (prefersReducedMotion()) {
      // Sin animación: encuadre directo (fitToPins ya respeta reduced-motion → 0 ms).
      fitToPins()
      return true
    }
    const pts: [number, number][] = routeRef.current.map((p) => [p.lng, p.lat])
    if (activeRef.current) pts.push(floatingActivePos(routeRef.current))
    if (pts.length === 0) {
      // Viaje vacío: no hay destino. Igual hacemos un acercamiento sutil al globo
      // para que la entrada no sea estática, sin reencuadrar nada.
      map.easeTo({ zoom: WORLD_ZOOM, duration: INTRO_DURATION, essential: true })
      return true
    }
    // Punto de partida: globo entero (más lejos que el encuadre final). Lo fijamos sin
    // animación y desde ahí volamos al destino, dando la sensación de aterrizar.
    map.jumpTo({ center: WORLD_CENTER, zoom: INTRO_START_ZOOM })
    if (pts.length === 1) {
      map.flyTo({
        center: pts[0],
        zoom: SINGLE_ZOOM,
        duration: INTRO_DURATION,
        essential: true, // ignora reduced-motion del navegador: ya lo gestionamos arriba
      })
      return true
    }
    const bounds = new gl.LngLatBounds(pts[0], pts[0])
    for (const p of pts) bounds.extend(p)
    map.fitBounds(bounds, {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      duration: INTRO_DURATION,
      essential: true,
    })
    return true
  }, [fitToPins])

  // ── Montaje: crea el mapa una sola vez (import dinámico de maplibre + su CSS). ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false

    void (async () => {
      try {
        // Import dinámico: maplibre (WebGL, ~grande) va a su propio chunk. El CSS se
        // importa aquí mismo para que viaje con el chunk y no engorde el inicial.
        const gl = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (disposed) return
        glRef.current = gl

        const map = new gl.Map({
          container,
          style: BASE_STYLE,
          center: WORLD_CENTER,
          zoom: WORLD_ZOOM,
          // Suelo de zoom: que el satélite SIEMPRE llene el lienzo a sangre (Polarsteps),
          // sin alejarse tanto que aparezca el globo entero flotando en cielo oscuro. Si
          // un viaje tiene puntos muy dispersos, fitBounds clampa aquí y centra (raro en
          // un viaje real, casi siempre regional). El intro cinematográfico también clampa.
          minZoom: MIN_FILL_ZOOM,
          // SIN control de atribución de MapLibre: su modo compacto no ocultaba el texto
          // de Esri en prod (salía como banda, ver #363/#382). Sin control = imposible que
          // aparezca la banda; el crédito lo damos con nuestro propio "ⓘ" (ver render).
          attributionControl: false,
          // Con reduced-motion no animamos el fade de tiles.
          fadeDuration: prefersReducedMotion() ? 0 : 300,
        })
        mapRef.current = map

        // OJO: NO escuchamos `map.on('error')`. MapLibre lo dispara por fallos
        // transitorios (un tile Esri que da 404), que NO deben tumbar el globo. Solo
        // los fallos de import/creación (try/catch) o de render (boundary) caen al
        // plano; un tile suelto se reintenta sin perder el "hero".
        map.on('load', () => {
          if (disposed) return
          // Globo: la proyección llegó en v4 y se activa tras cargar el estilo.
          map.setProjection({ type: 'globe' })
          // Atmósfera/cielo NOCHE (fase "nuevo enfoque"). Feature-detect dentro: si
          // la versión no lo soporta, se omite sin romper el globo que ya funciona.
          applySky(map)
          // Raster Esri World Imagery (satélite) como capa de fondo (sin key). En
          // globo da el look "atlas vivo": el mundo real con la ruta y los pines encima.
          // Sin `attribution` en las fuentes: no hay control de MapLibre que lo muestre
          // (el crédito sale de nuestro "ⓘ"). Así nada puede regenerar la banda.
          map.addSource('basemap', {
            type: 'raster',
            tiles: [ESRI_SATELLITE.url],
            tileSize: 256,
            maxzoom: ESRI_SATELLITE.maxNativeZoom,
          })
          map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' })
          // Etiquetas (nombres de ciudad / fronteras) sobre el satélite: capa de
          // REFERENCIA Esri transparente (preset "diario"). Sitúa los recuerdos sin
          // tapar la foto aérea; va ANTES de la ruta/pines para que queden encima.
          map.addSource('labels', {
            type: 'raster',
            tiles: [ESRI_REFERENCE_LABELS.url],
            tileSize: 256,
            maxzoom: ESRI_REFERENCE_LABELS.maxNativeZoom,
          })
          map.addLayer({ id: 'labels', type: 'raster', source: 'labels' })
          readyRef.current = true
          // Mapa "listo" para OCULTAR el skeleton: el primer `idle` tras añadir el
          // raster = teselas del encuadre cargadas y sin transiciones en curso. Es
          // el momento en que el lienzo ya muestra el satélite, no el hueco negro.
          map.once('idle', () => {
            if (readyFallbackRef.current != null) {
              window.clearTimeout(readyFallbackRef.current)
              readyFallbackRef.current = null
            }
            if (!disposed) setMapReady(true)
          })
          // Red de seguridad: si `idle` no llega, no dejamos el spinner colgado.
          readyFallbackRef.current = window.setTimeout(() => {
            readyFallbackRef.current = null
            if (!disposed) setMapReady(true)
          }, MAP_READY_FALLBACK_MS)
          repaint()
          // Entrada cinematográfica una sola vez; si no la hace, fitBounds normal.
          if (!introDoneRef.current) {
            introDoneRef.current = true
            if (!introFlight()) fitToPins()
          } else {
            fitToPins()
          }
        })
      } catch (err) {
        // Import o creación del mapa falló → que el boundary caiga al plano.
        if (!disposed) setInitError(err)
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      if (readyFallbackRef.current != null) {
        window.clearTimeout(readyFallbackRef.current)
        readyFallbackRef.current = null
      }
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      glRef.current = null
    }
  }, [repaint, fitToPins, introFlight])

  // Repinta cuando cambian los datos O el dibujado por etapas (selección/play). No-op
  // hasta que el estilo cargó; el handler `load` hace el primer pintado.
  useEffect(() => {
    repaint()
  }, [route, activeMoment, selectedChallengeId, playing, repaint])

  // ── Vuela al pin seleccionado (sin re-encuadrar todo). ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !selectedChallengeId) return
    // El momento activo no está clavado (anti-spoiler): si lo seleccionan, volamos
    // a su posición FLOTANTE (centroide), no a una coordenada real que no existe.
    const target = route.find((p) => p.challengeId === selectedChallengeId)
    const isActiveSelected = activeRef.current?.challengeId === selectedChallengeId
    if (target == null && !isActiveSelected) return
    const center: [number, number] = target
      ? [target.lng, target.lat]
      : floatingActivePos(routeRef.current)
    // Tocar = ZOOM al punto (no solo pan): garantizamos al menos nivel ciudad.
    const zoom = Math.max(map.getZoom(), SELECT_ZOOM)
    // Con reduced-motion saltamos sin vuelo (jumpTo); si no, vuelo suave.
    if (prefersReducedMotion()) {
      map.jumpTo({ center, zoom })
    } else {
      map.flyTo({ center, zoom, duration: 800 })
    }
  }, [selectedChallengeId, route])

  return (
    <div className={styles.root}>
      <div ref={containerRef} className={styles.map} />
      {/* Estado de carga: tapa el lienzo hasta que el satélite pinta sus teselas
          (primer `idle`); luego se funde y se desmonta. Evita el "parece roto". */}
      {!skeletonGone && (
        <MapSkeleton hidden={mapReady} onFadeOutEnd={() => setSkeletonGone(true)} />
      )}
      {/* Crédito propio (NO control de MapLibre): "ⓘ" discreto que despliega el texto de
          Esri al tocar. `title` nativo + popover visible. Cumple la atribución sin banda. */}
      <div className={styles.credit}>
        {creditOpen && <span className={styles.creditText}>{MAP_CREDIT}</span>}
        <button
          type="button"
          className={[styles.creditButton, 'lg-press'].join(' ')}
          title={MAP_CREDIT}
          aria-label="Créditos del mapa"
          aria-expanded={creditOpen}
          onClick={() => setCreditOpen((v) => !v)}
        >
          <Icon icon={Info} size={14} />
        </button>
      </div>
    </div>
  )
}

/**
 * Crea o actualiza una capa `line` con sus coordenadas. Si no hay puntos suficientes
 * deja la geometría vacía (la capa existe pero no dibuja). Centraliza el patrón
 * source+layer de MapLibre para las dos rutas (continua y discontinua).
 */
function upsertLine(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  coords: [number, number][],
  paint: { color: string; dash?: [number, number] },
) {
  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
  const existing = map.getSource(sourceId)
  if (existing && 'setData' in existing) {
    ;(existing as { setData: (d: typeof data) => void }).setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': paint.color,
      'line-width': 3,
      ...(paint.dash ? { 'line-dasharray': paint.dash } : {}),
    },
  })
}
