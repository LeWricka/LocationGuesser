import { useCallback, useEffect, useRef, useState } from 'react'
// Tipos SOLO (import type → cero coste en bundle). El runtime entra por import()
// dinámico dentro del efecto para que maplibre quede en un chunk aparte.
import type {
  MapLibreMap,
  Marker as MapLibreMarker,
  SkySpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { RoutePoint } from '../../lib/trip'
import type { TripMapProps as Props } from './TripMap.types'
import './tripPins.css'
import styles from './TripMapGlobe.module.css'

// Basemap SATÉLITE por defecto (fase "nuevo enfoque"): Esri World Imagery sin API
// key. El gris claro resultaba soso; el satélite hace el globo "héroe" (atlas vivo,
// mundo real) y los pines-foto + la ruta en acento (tokens) son el color encima.
// tileSize 256 es lo que sirve Esri; va en globo.
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

// Centro/zoom del mundo hasta que fitBounds encuadra los pines (paridad con el plano).
const WORLD_CENTER: [number, number] = [0, 25]
const WORLD_ZOOM = 1.4

// Encuadre de pines (compartido con el plano para que globo y fallback coincidan):
//  - SINGLE_ZOOM: con un solo punto, zoom de CIUDAD (ni continente ni calle).
//  - FIT_MAX_ZOOM: techo al encuadrar varios; evita acercarse de más si los pines
//    están muy juntos. Por debajo de él, fitBounds elige el que enmarca todo.
//  - FIT_PADDING: margen para que los pines no queden bajo el chrome ni el carrusel.
//    Top mayor (chrome) y bottom mayor (carrusel) que los lados.
const SINGLE_ZOOM = 11
const FIT_MAX_ZOOM = 12
const FIT_PADDING = { top: 88, bottom: 220, left: 48, right: 48 }
// Suelo de zoom para que el satélite llene el lienzo (sin esfera flotando en el espacio).
// ~3.2 cubre el alto de un móvil en retrato con la proyección globo.
const MIN_FILL_ZOOM = 3.2
// Zoom mínimo al volar a un pin seleccionado: ciudad, sin re-encuadrar todo.
const SELECT_ZOOM = 11

// Entrada cinematográfica (Fase 2): arrancamos un punto MÁS lejos que WORLD_ZOOM
// (vista de globo entero) y "aterrizamos" en el encuadre de la ruta. Duración corta
// para que sea un gesto, no una espera. Con reduced-motion no se usa (salto directo).
const INTRO_START_ZOOM = 0.6
const INTRO_DURATION = 1500

// Ids de fuente/capa de la ruta (line). Constantes para añadir/quitar sin colisión.
const ROUTE_SRC = 'lg-route'
const ROUTE_LINE = 'lg-route-line'
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

/** Crea el elemento HTML de un pin-foto (cerrado o activo). Reusa las clases del
 * plano (`lg-trip-pin*`) para que el look —miniatura redonda + anillo + pulso— sea
 * idéntico; el color del anillo lo gobiernan los tokens, no se hardcodea. */
function pinElement(opts: { imageUrl: string | null; active: boolean }): HTMLDivElement {
  const el = document.createElement('div')
  if (opts.active) {
    el.className = 'lg-trip-pin lg-trip-pin--icon lg-trip-pin--active'
    el.textContent = '❓'
  } else if (opts.imageUrl) {
    el.className = 'lg-trip-pin'
    el.style.backgroundImage = `url('${opts.imageUrl.replace(/'/g, "\\'")}')`
  } else {
    el.className = 'lg-trip-pin lg-trip-pin--icon'
    el.textContent = '📍'
  }
  return el
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

// Atmósfera del globo (fase "nuevo enfoque"): con basemap SATÉLITE el azul noche
// suave vuelve a encajar — el globo terráqueo se lee como una esfera en el espacio,
// con un cielo oscuro y un halo atmosférico azulado en el borde. Son colores de
// PAINT de MapLibre (no CSS), así que no pueden ser `var(--token)`; valores próximos
// al acento pizarra para coherencia de marca.
const GLOBE_SKY: SkySpecification = {
  'sky-color': '#0d1722', // cielo: noche profunda (espacio tras el globo)
  'horizon-color': '#21384e', // horizonte: pizarra profundo que ilumina el borde
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
      withSky.setFog({ color: '#152838', 'horizon-blend': 0.2 })
    } catch {
      // No disponible/aceptada: ignorar.
    }
  }
}

export function TripMapGlobe({ route, activeMoment, selectedChallengeId, onSelectMoment }: Props) {
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

  // Props en refs: así las funciones de pintado (que el handler `load` invoca de
  // forma asíncrona) leen SIEMPRE el último valor, sin recrear el mapa ni arrastrar
  // closures obsoletas si los datos cambian antes de que el estilo cargue. La
  // escritura va en un efecto (no en render) para no romper la regla de hooks.
  const routeRef = useRef(route)
  const activeRef = useRef(activeMoment)
  const onSelectRef = useRef(onSelectMoment)
  useEffect(() => {
    routeRef.current = route
    activeRef.current = activeMoment
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

    // Pines de cerrados, clavados en su lat/lng real.
    for (const p of pts) {
      const el = pinElement({ imageUrl: p.imageUrl, active: false })
      el.addEventListener('click', () => onSelectRef.current(p.challengeId))
      markersRef.current.push(new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map))
    }

    // Pin del momento activo: FLOTANDO sobre el centroide (nunca su sitio real).
    if (active) {
      const el = pinElement({ imageUrl: null, active: true })
      el.addEventListener('click', () => onSelectRef.current(active.challengeId))
      markersRef.current.push(
        new gl.Marker({ element: el }).setLngLat(floatingActivePos(pts)).addTo(map),
      )
    }

    // Ruta: continua entre cerrados + discontinua hacia el activo flotante. El paint
    // WebGL no entiende `var(--token)`, así que resolvemos el token a color concreto
    // leyendo la variable computada (mismo valor que usa el plano por CSS).
    // Ruta en acento/tinta (tokens). El paint WebGL no entiende `var(--token)`, así
    // que resolvemos el token a color concreto leyendo la variable computada (mismo
    // valor que el plano usa por CSS). El fallback solo aplica si el token faltara.
    const css = getComputedStyle(map.getContainer())
    const lineColor = css.getPropertyValue('--route-line').trim() || 'rgba(24,32,43,0.6)'
    const dashColor = css.getPropertyValue('--route-line-dash').trim() || 'rgba(24,32,43,0.35)'
    const closed: [number, number][] = pts.map((p) => [p.lng, p.lat])
    const dash: [number, number][] | null =
      active && pts.length > 0
        ? [[pts[pts.length - 1].lng, pts[pts.length - 1].lat], floatingActivePos(pts)]
        : null

    upsertLine(map, ROUTE_SRC, ROUTE_LINE, closed.length >= 2 ? closed : [], { color: lineColor })
    upsertLine(map, DASH_SRC, DASH_LINE, dash ?? [], { color: dashColor, dash: [2, 2.5] })
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
          attributionControl: { compact: true },
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
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      glRef.current = null
    }
  }, [repaint, fitToPins, introFlight])

  // Repinta cuando cambian los datos (no recrea el mapa). No-op hasta que el
  // estilo cargó; el handler `load` hace el primer pintado.
  useEffect(() => {
    repaint()
  }, [route, activeMoment, repaint])

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

  return <div ref={containerRef} className={styles.map} />
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
