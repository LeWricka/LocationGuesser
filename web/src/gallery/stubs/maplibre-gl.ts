// Stub de maplibre-gl para la galería (alias de Vite SOLO en el entry de galería).
// Evita cargar el motor WebGL real y pedir tiles a la red (no determinista), pero
// conserva la API que usan HomeGlobe y TripMapGlobe: el mapa "carga" (dispara
// 'load') sobre un lienzo con la textura de "mapa nocturno de marca" (issue #661,
// ver nightMapTexture.ts) y los MARCADORES SÍ se clavan (sus elementos HTML se
// insertan en el contenedor), así los PINES siguen visibles para la revisión
// visual. Lo demás (tiles, vuelo) son no-ops deterministas — la PROYECCIÓN, no:
// ver el bloque siguiente (issue #681).

import { NIGHT_MAP_TEXTURE_URL } from './nightMapTexture'

type LngLat = [number, number]

interface MapOptions {
  container?: HTMLElement | string
  [key: string]: unknown
}

// ── Proyección aproximada de la galería (issue #681) ─────────────────────────
// Sin motor WebGL real no hay proyección de verdad, pero clavar TODOS los pines
// en el centro exacto del contenedor (comportamiento anterior) dejaba el mapa/
// globo del showcase con un único punto y un vacío negro alrededor — el feedback
// del dueño con capturas de un móvil OLED ("la home me sigue apareciendo sin
// imágenes de fondo"). Aproximamos una proyección EQUIRECTANGULAR sobre el bbox
// real de los pines vivos de CADA mapa (+ margen, para que ningún pin toque el
// canto o quede bajo el chrome flotante): con esto, cualquier caso con pines
// reales (showcase o no) reparte solos según sus propias coordenadas, sin
// necesitar un dataset "de mundo" fijo. Determinista: mismas coordenadas →
// mismas posiciones, siempre — cero `Math.random`.
interface LngLatPoint {
  lng: number
  lat: number
}

// Margen relativo al contenedor (fracción 0–0.5 por lado). El contenedor del
// mapa/globo es EL LIENZO ENTERO (100dvh en HomeGlobe/TripMapGlobe): el chrome
// que se solapa encima (marca/avatar arriba, chip "Te toca jugar" + dock del
// carrusel abajo en la home; cabecera + pestañas Diario/Fotos/Marcador arriba,
// timeline + carrusel abajo en el diario) es chrome PROPIO superpuesto, no
// relleno del propio contenedor — así que un margen "de aire" pensado para el
// hueco entre el borde y los pines (como el `FIT_PADDING` real) no basta: aquí
// hace falta esconder los pines DEL TODO del hueco que ese chrome tapa. Medido a
// ojo contra los dos casos más exigentes: arriba, el diario con pestañas (cabecera
// + pestañas ≈ 97px de 844 ≈ 11.5%); abajo, la home (el chip "Te toca jugar"
// empieza a ~37% de alto). El diario tiene más margen real disponible por abajo
// (su chrome inferior no empieza hasta ~73%), así que aquí sacrifica algo de
// reparto vertical a cambio de una invariante más simple y segura: en NINGÚN
// consumidor un pin queda tapado.
//
// OJO con el margen SUPERIOR: el ancla del `Marker` (`top: Y%`) es la PUNTA
// inferior del pin (`transform: translate(-50%, -100%)`), así que el disco de la
// foto se dibuja POR ENCIMA de esa coordenada — hay que reservar además el alto
// del propio pin (disco ~48px + puntita ~9px, ver `PIN_SIZE`/`PIN_TAIL` en
// `pinMarkers.ts`) para que el disco no quede él mismo bajo el chrome de arriba.
const MARGIN_X = 0.16
const MARGIN_TOP = 0.2
const MARGIN_BOTTOM = 0.68

// ── Margen consciente del padding/offset REALES pedidos por el componente (#693) ──
// Los tres de arriba son el DECORATIVO por defecto (sin `fitBounds`/`easeTo`/`jumpTo`
// con padding u offset explícitos). Pero HomeGlobe (home logueada) SÍ pasa un padding
// real, consciente del dock (`computeFitPaddingY` en HomeGlobe.tsx) y un offset real al
// volar al pin activo (`verticalFrameOffset`) — si el stub los ignorase, el guardarraíl
// de Playwright que compara pin-vs-dock (#693) no protegería nada: el pin caería
// siempre en el mismo sitio decorativo, calibrado bien o mal el padding real. Por eso
// el margen EFECTIVO se deriva, de aquí en adelante, del último padding/offset real
// recibido (si lo hay) — ver `Map.computeMargins`.
interface Margins {
  x: number
  top: number
  bottom: number
}
const DEFAULT_MARGINS: Margins = { x: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM }

/** Nunca un margen que invierta o cierre del todo el hueco visible del eje. */
function clampFrac(v: number): number {
  return Math.min(0.49, Math.max(0, v))
}

function computeBBox(points: LngLatPoint[]): {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
} | null {
  if (points.length === 0) return null
  let minLng = points[0].lng
  let maxLng = points[0].lng
  let minLat = points[0].lat
  let maxLat = points[0].lat
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  return { minLng, maxLng, minLat, maxLat }
}

/** lng/lat → posición relativa (%) dentro del contenedor, dado el bbox de TODOS
 * los puntos vivos del mapa (pines + coordenadas de cualquier ruta). Un bbox
 * degenerado (un único punto, o varios en la misma coordenada) cae al centro del
 * hueco que deja el margen, nunca al canto. `margins` por defecto es el decorativo de
 * arriba; `Map.computeMargins` calcula uno real cuando hay padding/offset pedidos. */
function projectToPercent(
  point: LngLatPoint,
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  margins: Margins = DEFAULT_MARGINS,
): { xPct: number; yPct: number } {
  const spanLng = bbox.maxLng - bbox.minLng
  const spanLat = bbox.maxLat - bbox.minLat
  const nx = spanLng > 0 ? (point.lng - bbox.minLng) / spanLng : 0.5
  const ny = spanLat > 0 ? (bbox.maxLat - point.lat) / spanLat : 0.5
  const xPct = (margins.x + nx * (1 - 2 * margins.x)) * 100
  const yPct = (margins.top + ny * (1 - margins.top - margins.bottom)) * 100
  return { xPct, yPct }
}

/** Forma mínima de un `Feature` GeoJSON de línea (lo que construye `upsertLine` en
 * TripMapGlobe): solo nos interesan sus coordenadas para dibujar la ruta real. */
function coordsOf(feature: unknown): LngLat[] {
  const f = feature as { geometry?: { coordinates?: LngLat[] } } | null | undefined
  return f?.geometry?.coordinates ?? []
}

const SVG_NS = 'http://www.w3.org/2000/svg'

interface LineLayerConfig {
  source: string
  color: string
  dash?: [number, number]
}

export class Map {
  private container: HTMLElement | null = null
  private loadCbs: Array<() => void> = []
  private idleCbs: Array<() => void> = []
  // Registro de pines vivos (para el bbox de la proyección) y de las fuentes/capas
  // de línea pedidas por el componente (`addSource`/`addLayer`, ver `TripMapGlobe`
  // → `upsertLine`), para dibujar la ruta dorada por encima de la textura pero
  // conectando las posiciones REALES proyectadas — no una decoración fija.
  // `globalThis.Map`/`Set`, no la clase `Map` de este módulo (colisión de nombre:
  // esta clase también se llama `Map`, la del mapa MapLibre — ver export de abajo).
  private markers = new globalThis.Set<Marker>()
  private sources = new globalThis.Map<string, unknown>()
  private lineLayers = new globalThis.Map<string, LineLayerConfig>()
  private routeOverlay: SVGSVGElement | null = null
  // Último padding REAL pedido a `fitBounds` (#693), en px — o `null` sin pedir ninguno
  // todavía (cae al margen decorativo). `fitBounds` es "absoluto": recoloca la cámara
  // desde cero, así que también DESCARTA cualquier `cameraOffset` anterior (mismo
  // espíritu que el motor real: el padding de un fit no convive con el offset de un
  // vuelo previo, uno sustituye al otro).
  private fitPadding: { top: number; bottom: number; left: number; right: number } | null = null
  // Último offset REAL pedido a `easeTo`/`jumpTo` (#693, vuelo al pin activo), en px —
  // o `null` sin pedir ninguno (cae al margen decorativo, o al de `fitPadding` si lo
  // hubiera). Igual de "absoluto" en sentido inverso: pedir un offset descarta el
  // `fitPadding` anterior (un vuelo a un punto sustituye al fit de bounds, como en el
  // motor real: el padding solo influye en EL CÁLCULO del fit, no es estado persistente
  // de cámara).
  private cameraOffset: { x: number; y: number } | null = null

  constructor(opts: MapOptions = {}) {
    const c = opts.container
    this.container = typeof c === 'string' ? document.getElementById(c) : (c ?? null)
    if (this.container) {
      // Fondo de escena: la textura "mapa nocturno de marca" (issue #661), no un
      // azul pizarra liso — el feedback del dueño sobre #656 fue que la zona de
      // mapa del showcase salía NEGRA/rota. Decisión GLOBAL (no solo showcase-*):
      // probado en 'viaje-diario' (diario real, no showcase) sin romper a11y/
      // overflow ni el propio look — es decoración bajo los pines, no compite con
      // ellos — así que mejora TODA captura de la galería que monte un mapa
      // stubeado, no solo las del showcase (ver nightMapTexture.ts para el porqué
      // de cada elemento del dibujo).
      this.container.style.backgroundColor = '#0b1016'
      this.container.style.backgroundImage = `url("${NIGHT_MAP_TEXTURE_URL}")`
      this.container.style.backgroundSize = 'cover'
      this.container.style.backgroundPosition = 'center'
      this.container.style.backgroundRepeat = 'no-repeat'
      // Overlay SVG de la ruta REAL (issue #681): `viewBox="0 0 100 100"` +
      // `preserveAspectRatio="none"` para que sus coordenadas casen EXACTAMENTE
      // con los `left/top %` que aplicamos a cada `Marker` (mismo sistema
      // porcentual en cada eje, estire lo que estire el contenedor). Se inserta
      // como PRIMER hijo, antes que ningún pin: el orden del DOM decide el
      // apilado (mismo contexto de stacking, sin z-index), así la ruta queda
      // siempre bajo los pines, nunca por encima tapándolos.
      this.routeOverlay = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
      this.routeOverlay.setAttribute('viewBox', '0 0 100 100')
      this.routeOverlay.setAttribute('preserveAspectRatio', 'none')
      this.routeOverlay.style.position = 'absolute'
      this.routeOverlay.style.inset = '0'
      this.routeOverlay.style.width = '100%'
      this.routeOverlay.style.height = '100%'
      this.routeOverlay.style.pointerEvents = 'none'
      this.container.appendChild(this.routeOverlay)
    }
    // 'load' en microtarea: deja que el componente registre su callback primero.
    queueMicrotask(() => {
      for (const cb of this.loadCbs) cb()
      // 'idle' justo después (issue #652): TripMapGlobe usa `map.once('idle', …)`
      // dentro de su propio handler 'load' para ocultar el skeleton de carga (el
      // registro de 'idle' ocurre síncrono dentro del bucle de arriba, así que ya
      // está en `idleCbs` en este punto). El motor real dispara 'idle' cuando no
      // quedan teselas pendientes; el stub no pinta teselas de verdad, así que no
      // hay nada pendiente — sin este microtask, el skeleton se queda colgado hasta
      // su temporizador de red de seguridad (MAP_READY_FALLBACK_MS, 4s), más que el
      // tiempo que espera la captura de la galería, y sale un spinner en vez del
      // diario/globo con sus pines.
      queueMicrotask(() => {
        for (const cb of this.idleCbs) cb()
      })
    })
  }

  // ── Registro de pines (llamado por Marker.addTo/remove) ──────────────────
  registerMarker(marker: Marker): void {
    this.markers.add(marker)
    this.layout()
  }
  unregisterMarker(marker: Marker): void {
    this.markers.delete(marker)
    this.layout()
  }

  /**
   * Margen EFECTIVO del momento: deriva de `fitPadding`/`cameraOffset` (lo último
   * pedido de verdad, ver los comentarios de esos campos) contra el tamaño REAL del
   * contenedor; sin ninguno de los dos (aún no se llamó a `fitBounds`/`easeTo` con
   * padding/offset), cae al decorativo `DEFAULT_MARGINS`.
   *
   * `cameraOffset` no tiene bbox propio que "encajar" (es un desplazamiento de cámara,
   * no un encuadre de varios puntos) — para poder reusar la MISMA fórmula de
   * `projectToPercent` (que sí asume un rectángulo visible con margen por lado),
   * traducimos el offset a un rectángulo del MISMO ANCHO/ALTO que el decorativo pero
   * RECENTRADO: así un punto único (bbox degenerado, `nx=ny=0.5`) aterriza exactamente
   * en `centro-del-lienzo + offset`, igual que en el motor real.
   */
  private computeMargins(): Margins {
    const rect = this.container?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return DEFAULT_MARGINS

    if (this.fitPadding) {
      const top = clampFrac(this.fitPadding.top / rect.height)
      const bottom = clampFrac(this.fitPadding.bottom / rect.height)
      // Los cuatro FIT_PADDING reales de HomeGlobe/TripMapGlobe son simétricos
      // izq/der: basta uno para el margen `x` (compartido por ambos lados).
      const x = clampFrac(this.fitPadding.left / rect.width)
      return { x, top, bottom }
    }

    if (this.cameraOffset) {
      // `top`/`bottom` están LIGADOS por construcción (su suma siempre deja el mismo
      // `visibleHeight` decorativo, recentrado): NO se pueden clampar por separado con
      // `clampFrac` (tope 0.49 por lado) sin romper esa relación — para un offset
      // grande (pin cerca de un canto), el margen del lado ancho supera 0.49 de forma
      // LEGÍTIMA (solo indica "casi todo el hueco de ese lado"), y clamparlo ahí
      // desplazaba el punto hacia el lado EQUIVOCADO en vez de mantenerlo centrado en
      // el offset pedido (bug real, cazado con el propio guardarraíl de #693: el pin
      // aterrizaba más abajo de lo que pedía `verticalFrameOffset`). En su lugar,
      // clampamos solo `top` a un rango que garantiza `bottom = 1 - top - visible`
      // siempre no-negativo, y derivamos `bottom` de esa igualdad — invariante
      // preservado por construcción, nunca roto a posteriori.
      const visibleWidth = 1 - 2 * MARGIN_X
      const visibleHeight = 1 - MARGIN_TOP - MARGIN_BOTTOM
      const ofx = this.cameraOffset.x / rect.width
      const ofy = this.cameraOffset.y / rect.height
      // Horizontal: el modelo de `Margins` solo admite un margen SIMÉTRICO (mismo
      // valor a ambos lados, ver `projectToPercent`), así que un `ofx` no puede
      // recentrar de verdad — hoy es irrelevante (HomeGlobe solo pasa offset
      // vertical, `[0, offsetY]`), documentado por si algún día hiciera falta más.
      const x = clampFrac(0.5 + ofx - visibleWidth / 2)
      const top = Math.min(Math.max(0.5 + ofy - visibleHeight / 2, 0), 1 - visibleHeight)
      const bottom = 1 - top - visibleHeight
      return { x, top, bottom }
    }

    return DEFAULT_MARGINS
  }

  /** Recoloca TODOS los pines vivos (proyección sobre su bbox conjunto + el de
   * cualquier ruta) y redibuja la ruta dorada. Se llama en cada alta/baja de pin
   * y en cada `addLayer`/`setData` de tipo línea: siempre determinista, sin
   * animación (no hay "vuelo" que fingir en una captura estática). */
  layout(): void {
    const points: LngLatPoint[] = []
    for (const m of this.markers) {
      const [lng, lat] = m.getLngLat()
      points.push({ lng, lat })
    }
    for (const layer of this.lineLayers.values()) {
      for (const [lng, lat] of coordsOf(this.sources.get(layer.source))) {
        points.push({ lng, lat })
      }
    }
    const bbox = computeBBox(points)
    const margins = this.computeMargins()
    if (bbox) {
      for (const m of this.markers) m.applyProjectedPosition(bbox, margins)
    }
    this.drawRoute(bbox, margins)
  }

  private drawRoute(
    bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number } | null,
    margins: Margins,
  ): void {
    const svg = this.routeOverlay
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    if (!bbox) return
    for (const layer of this.lineLayers.values()) {
      const coords = coordsOf(this.sources.get(layer.source))
      if (coords.length < 2) continue
      const d = coords
        .map(([lng, lat], i) => {
          const { xPct, yPct } = projectToPercent({ lng, lat }, bbox, margins)
          return `${i === 0 ? 'M' : 'L'} ${xPct.toFixed(2)} ${yPct.toFixed(2)}`
        })
        .join(' ')
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', layer.color)
      // Fiel a la app real: upsertLine pinta 'line-width': 3 (px de pantalla).
      // El viewBox del overlay es porcentual (0-100), así que un stroke-width
      // en unidades de usuario se escalaría con el contenedor (1.1 ≈ 9px en el
      // marco del showcase — salía una banda gorda). non-scaling-stroke fija
      // el grosor en px de dispositivo, como MapLibre.
      path.setAttribute('stroke-width', '3')
      path.setAttribute('vector-effect', 'non-scaling-stroke')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      if (layer.dash) path.setAttribute('stroke-dasharray', layer.dash.join(' '))
      svg.appendChild(path)
    }
  }

  on(event: string, cb: () => void): this {
    if (event === 'load') this.loadCbs.push(cb)
    return this
  }
  once(event: string, cb: () => void): this {
    if (event === 'idle') {
      this.idleCbs.push(cb)
      return this
    }
    return this.on(event, cb)
  }
  off(): this {
    return this
  }
  setProjection(): this {
    return this
  }
  addSource(id: string, source: { data?: unknown }): this {
    // Solo nos interesan fuentes GeoJSON de línea (la ruta, ver `upsertLine` en
    // TripMapGlobe): guardamos su `data` (el `Feature`) tal cual para que
    // `drawRoute` lea las coordenadas reales cuando haga falta.
    this.sources.set(id, source?.data)
    return this
  }
  addLayer(layer: {
    id: string
    type: string
    source: string
    paint?: Record<string, unknown>
  }): this {
    if (layer.type === 'line') {
      const paint = layer.paint ?? {}
      const color =
        typeof paint['line-color'] === 'string' ? (paint['line-color'] as string) : '#D9B96A'
      const dashRaw = paint['line-dasharray']
      const dash =
        Array.isArray(dashRaw) && dashRaw.length === 2
          ? ([dashRaw[0], dashRaw[1]] as [number, number])
          : undefined
      this.lineLayers.set(layer.id, { source: layer.source, color, dash })
      this.layout()
    }
    return this
  }
  getSource(id: string): { setData: (data: unknown) => void } | undefined {
    if (!this.sources.has(id)) return undefined
    return {
      setData: (data: unknown) => {
        this.sources.set(id, data)
        this.layout()
      },
    }
  }
  removeLayer(): this {
    return this
  }
  removeSource(): this {
    return this
  }
  // `offset` (#693: vuelo al pin activo con `verticalFrameOffset`) es lo único que nos
  // interesa de las opciones de cámara — el resto (`center`/`zoom`/`duration`) no
  // afecta a esta proyección aproximada (que no tiene estado de cámara real, solo
  // deriva las posiciones del bbox de los pines vivos). Un offset "presente pero
  // [0,0]" SÍ cuenta como pedido explícito (recentra en el medio del rectángulo
  // decorativo) — se distingue de "sin offset" (`undefined`, cae al padding/margen
  // previos) comprobando la propia opción, no el valor.
  easeTo(opts?: { offset?: [number, number] }): this {
    if (opts?.offset) {
      this.cameraOffset = { x: opts.offset[0], y: opts.offset[1] }
      this.fitPadding = null
    }
    this.layout()
    return this
  }
  flyTo(): this {
    return this
  }
  // `padding` (#693: encuadre consciente del dock, `computeFitPaddingY`) es lo único
  // que nos interesa — ver comentario de `easeTo` arriba, mismo motivo.
  fitBounds(
    _bounds: unknown,
    opts?: { padding?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>> },
  ): this {
    if (opts?.padding) {
      this.fitPadding = {
        top: opts.padding.top ?? 0,
        bottom: opts.padding.bottom ?? 0,
        left: opts.padding.left ?? 0,
        right: opts.padding.right ?? 0,
      }
      this.cameraOffset = null
    }
    this.layout()
    return this
  }
  setSky(): this {
    return this
  }
  setFog(): this {
    return this
  }
  stop(): this {
    return this
  }
  resize(): this {
    return this
  }
  // Faltaban estos cuatro (issue #652): TripMapGlobe los llama SIN feature-detect
  // (a diferencia de HomeGlobe, que sí comprueba `typeof map.jumpTo === 'function'`
  // antes de usarlo). Sin ellos, la entrada cinematográfica del diario lanzaba un
  // `TypeError` no capturado dentro del handler `load` — abortaba a media
  // ejecución y con ello el registro de `idle` (ver microtarea del constructor):
  // el skeleton del mapa se quedaba colgado hasta su temporizador de red de
  // seguridad (MAP_READY_FALLBACK_MS), más lento que la espera de la galería.
  // `offset` (#693, salto sin animación con `prefers-reduced-motion`): mismo trato que
  // `easeTo` de arriba — es el mismo vuelo, sin animar.
  jumpTo(opts?: { offset?: [number, number] }): this {
    if (opts?.offset) {
      this.cameraOffset = { x: opts.offset[0], y: opts.offset[1] }
      this.fitPadding = null
    }
    this.layout()
    return this
  }
  setCenter(): this {
    return this
  }
  setMinZoom(): this {
    return this
  }
  getCenter(): { lng: number; lat: number } {
    return { lng: 0, lat: 0 }
  }
  getZoom(): number {
    return 2
  }
  cameraForBounds(): { center: LngLat; zoom: number } | undefined {
    return undefined
  }
  getCanvas(): HTMLCanvasElement {
    return document.createElement('canvas')
  }
  getContainer(): HTMLElement | null {
    return this.container
  }
  remove(): void {
    this.loadCbs = []
  }
}

export class Marker {
  private element: HTMLElement | null
  private lngLat: LngLat = [0, 0]
  private parent: HTMLElement | null = null
  private map: Map | null = null

  constructor(opts?: { element?: HTMLElement; anchor?: string }) {
    this.element = opts?.element ?? document.createElement('div')
  }
  setLngLat(lngLat: LngLat): this {
    this.lngLat = lngLat
    // Ya clavado: recalcula su posición (y la de todos, el bbox pudo cambiar).
    if (this.map) this.map.layout()
    return this
  }
  addTo(map: Map): this {
    // Clavamos el elemento del pin en el contenedor del mapa para que se vea en la
    // captura. Posición PROVISIONAL (centrada): `map.registerMarker`, justo abajo,
    // dispara `layout()` de inmediato con el bbox ya actualizado — este valor solo
    // cubre el instante entre el `appendChild` y ese recálculo síncrono.
    const container = map.getContainer()
    if (container && this.element) {
      this.element.style.position = 'absolute'
      this.element.style.left = '50%'
      this.element.style.top = '50%'
      this.element.style.transform = 'translate(-50%, -100%)'
      container.appendChild(this.element)
      this.parent = container
    }
    this.map = map
    map.registerMarker(this)
    return this
  }
  getElement(): HTMLElement | null {
    return this.element
  }
  remove(): this {
    if (this.map) {
      this.map.unregisterMarker(this)
      this.map = null
    }
    if (this.parent && this.element && this.element.parentNode === this.parent) {
      this.parent.removeChild(this.element)
    }
    return this
  }
  /** @internal usado por `Map.layout` (bbox + proyección). */
  getLngLat(): LngLat {
    return this.lngLat
  }
  /** @internal aplica la posición proyectada; lo llama `Map.layout`. */
  applyProjectedPosition(
    bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number },
    margins?: Margins,
  ): void {
    if (!this.element) return
    const { xPct, yPct } = projectToPercent(
      { lng: this.lngLat[0], lat: this.lngLat[1] },
      bbox,
      margins,
    )
    this.element.style.left = `${xPct}%`
    this.element.style.top = `${yPct}%`
    this.element.style.transform = 'translate(-50%, -100%)'
  }
}

export class LngLatBounds {
  extend(): this {
    return this
  }
  getCenter(): { lng: number; lat: number } {
    return { lng: 0, lat: 0 }
  }
}

// Tipos que importan los componentes (solo para satisfacer `import type`).
export type StyleSpecification = Record<string, unknown>
export type SkySpecification = Record<string, unknown>

export default { Map, Marker, LngLatBounds }
