import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { RoutePoint } from '../../lib/trip'

// --- Doble de maplibre-gl con un motor de proyección Mercator REAL --------------
//
// A diferencia de otros dobles del repo (p.ej. HomeGlobe.test.tsx), este necesita
// verificar GEOMETRÍA real: la regresión #640 solo se detecta comprobando que,
// tras el encuadre inicial, los pines caen DENTRO del lienzo — no basta con
// inspeccionar qué opciones recibió `easeTo`. Por eso el doble implementa Web
// Mercator (las mismas fórmulas que usa MapLibre para zoom/proyección, con
// TILE_SIZE=512) para `project()`, `cameraForBounds()` y el clamp de `minZoom`
// que aplica CUALQUIER llamada de cámara real (`easeTo`/`flyTo`/`jumpTo`) — ese
// clamp es la pieza que reproduce el bug original si el componente reintrodujera
// un `setMinZoom` demasiado alto o en el orden equivocado.
const TILE_SIZE = 512

function lngLatToWorld(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom
  const x = ((lng + 180) / 360) * scale
  const latRad = (lat * Math.PI) / 180
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI)) * scale
  return { x, y }
}

type LngLatTuple = [number, number]

interface Padding {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

class MockLngLatBounds {
  sw: LngLatTuple
  ne: LngLatTuple
  constructor(sw: LngLatTuple, ne: LngLatTuple) {
    this.sw = [...sw]
    this.ne = [...ne]
  }
  extend(p: LngLatTuple) {
    this.sw = [Math.min(this.sw[0], p[0]), Math.min(this.sw[1], p[1])]
    this.ne = [Math.max(this.ne[0], p[0]), Math.max(this.ne[1], p[1])]
    return this
  }
}

type Handler = { handler: () => void; once?: boolean }

class MockMap {
  container: HTMLElement
  center: LngLatTuple
  zoom: number
  minZoomVal = 0
  handlers: Record<string, Handler[]> = {}
  easeToCalls: Record<string, unknown>[] = []
  flyToCalls: Record<string, unknown>[] = []
  jumpToCalls: Record<string, unknown>[] = []
  constructor(opts: {
    container: HTMLElement
    center: LngLatTuple
    zoom: number
    minZoom?: number
  }) {
    this.container = opts.container
    this.center = opts.center
    this.zoom = opts.zoom
    this.minZoomVal = opts.minZoom ?? 0
    mapInstances.push(this)
  }
  private size(): { width: number; height: number } {
    const r = this.container.getBoundingClientRect()
    return { width: r.width, height: r.height }
  }
  on(event: string, handler: () => void) {
    ;(this.handlers[event] ??= []).push({ handler })
    return this
  }
  once(event: string, handler: () => void) {
    ;(this.handlers[event] ??= []).push({ handler, once: true })
    return this
  }
  off() {
    return this
  }
  fire(event: string) {
    const list = this.handlers[event] ?? []
    this.handlers[event] = list.filter((h) => {
      h.handler()
      return !h.once
    })
  }
  addSource() {}
  addLayer() {}
  // `upsertLine` (TripMapGlobe.tsx) pregunta si la fuente ya existe antes de
  // decidir `addSource`/`setData`: sin fuentes reales, siempre es la primera vez.
  getSource() {
    return undefined
  }
  setProjection() {}
  stop() {}
  remove() {}
  getContainer() {
    return this.container
  }
  getCenter() {
    return { lng: this.center[0], lat: this.center[1] }
  }
  setCenter(c: LngLatTuple) {
    this.center = c
  }
  getZoom() {
    return this.zoom
  }
  setMinZoom(z: number) {
    this.minZoomVal = z
  }
  getMinZoom() {
    return this.minZoomVal
  }
  // Simula el clamp REAL de MapLibre: ninguna llamada de cámara puede acabar por
  // debajo del `minZoom` configurado en ESE momento. Es la pieza que reproduce el
  // bug #640 si el componente fijara el suelo DESPUÉS de pedir el zoom bajo, o lo
  // dejara más alto de lo que el propio encuadre necesita.
  private applyCamera(opts: {
    center?: LngLatTuple | { lng: number; lat: number }
    zoom?: number
  }) {
    if (opts.zoom != null) this.zoom = Math.max(this.minZoomVal, opts.zoom)
    if (opts.center) {
      this.center = Array.isArray(opts.center) ? opts.center : [opts.center.lng, opts.center.lat]
    }
  }
  easeTo(opts: Record<string, unknown>) {
    this.easeToCalls.push(opts)
    this.applyCamera(opts as { center?: LngLatTuple; zoom?: number })
  }
  flyTo(opts: Record<string, unknown>) {
    this.flyToCalls.push(opts)
    this.applyCamera(opts as { center?: LngLatTuple; zoom?: number })
  }
  jumpTo(opts: Record<string, unknown>) {
    this.jumpToCalls.push(opts)
    this.applyCamera(opts as { center?: LngLatTuple; zoom?: number })
  }
  /** Réplica de `Map#cameraForBounds`: centro/zoom que ENCUADRARÍA `bounds` con el
   * padding dado, SIN aplicarlo — la pieza que el componente usa para decidir el
   * zoom "seguro" (`safeFitZoom`, TripMapGlobe.tsx) antes de mover la cámara. */
  cameraForBounds(bounds: MockLngLatBounds, options: { padding?: Padding; maxZoom?: number } = {}) {
    const { width, height } = this.size()
    const p = options.padding ?? {}
    const availW = Math.max(1, width - (p.left ?? 0) - (p.right ?? 0))
    const availH = Math.max(1, height - (p.top ?? 0) - (p.bottom ?? 0))
    const sw0 = lngLatToWorld(bounds.sw[0], bounds.sw[1], 0)
    const ne0 = lngLatToWorld(bounds.ne[0], bounds.ne[1], 0)
    const spanX = Math.abs(ne0.x - sw0.x)
    const spanY = Math.abs(sw0.y - ne0.y)
    const zoomX = spanX > 0 ? Math.log2(availW / spanX) : Infinity
    const zoomY = spanY > 0 ? Math.log2(availH / spanY) : Infinity
    let zoom = Math.min(zoomX, zoomY)
    if (options.maxZoom != null) zoom = Math.min(zoom, options.maxZoom)
    const center = {
      lng: (bounds.sw[0] + bounds.ne[0]) / 2,
      lat: (bounds.sw[1] + bounds.ne[1]) / 2,
    }
    return { center, zoom }
  }
  /** Réplica de `Map#fitBounds` real: usa `cameraForBounds` y APLICA la cámara
   * resultante pasando por el mismo clamp de `minZoom` que `applyCamera` — no la
   * usa el componente (arreglado #640 para no depender de ella), pero la
   * mantenemos fiel para que un test pueda ejercitar el camino ANTIGUO (previo
   * al fix) y comprobar que el doble reproduce el bug real, no un mock cojo. */
  fitBounds(bounds: MockLngLatBounds, options: { padding?: Padding; maxZoom?: number } = {}) {
    const cam = this.cameraForBounds(bounds, options)
    this.applyCamera(cam)
  }
  /** Proyecta una coordenada al pixel de PANTALLA con el centro/zoom ACTUALES —
   * usado por los tests para comprobar que un pin cae DENTRO del lienzo tras el
   * encuadre (en vez de fiarse solo de qué opciones recibió `easeTo`/`flyTo`). */
  project([lng, lat]: LngLatTuple): { x: number; y: number } {
    const { width, height } = this.size()
    const c = lngLatToWorld(lng, lat, this.zoom)
    const centerW = lngLatToWorld(this.center[0], this.center[1], this.zoom)
    return { x: width / 2 + (c.x - centerW.x), y: height / 2 + (c.y - centerW.y) }
  }
}

class MockMarker {
  opts: Record<string, unknown>
  lngLat: LngLatTuple | null = null
  constructor(opts: Record<string, unknown>) {
    this.opts = opts
  }
  setLngLat(ll: LngLatTuple) {
    this.lngLat = ll
    return this
  }
  addTo() {
    return this
  }
  remove() {}
}

let mapInstances: MockMap[] = []

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  Marker: MockMarker,
  LngLatBounds: MockLngLatBounds,
}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

import { TripMapGlobe } from './TripMapGlobe'

// Contenedor "compacto" de referencia (el mismo alto que calibra MIN_FILL_REFERENCE_PX
// en TripMapGlobe.tsx): con este tamaño el suelo de relleno vale exactamente su base
// (MIN_FILL_ZOOM_BASE = 3.2), un número redondo y fácil de razonar en los asserts.
const CONTAINER = { width: 390, height: 844 }
const MIN_FILL_ZOOM = 3.2

beforeEach(() => {
  mapInstances = []
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: CONTAINER.width,
    height: CONTAINER.height,
    top: 0,
    left: 0,
    right: CONTAINER.width,
    bottom: CONTAINER.height,
    x: 0,
    y: 0,
    toJSON() {
      return {}
    },
  } as DOMRect)
  // reduced-motion=true: salta directo a `fitToPins` (sin el vuelo cinematográfico
  // de `introFlight`), que es donde vive la lógica bajo prueba — mismo patrón que
  // HomeGlobe.test.tsx.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function point(challengeId: string, lat: number, lng: number, title: string): RoutePoint {
  return { challengeId, lat, lng, title, imageUrl: null, date: '2026-01-01T00:00:00.000Z' }
}

describe('TripMapGlobe — encuadre inicial no recorta el viaje (#640)', () => {
  test('viaje intercontinental (Pamplona + Colombia): el suelo de relleno NO se aplica y ambos pines quedan dentro del lienzo', async () => {
    const pamplona = point('pamplona', 42.8169, -1.6432, 'Pamplona')
    const bogota = point('bogota', 4.711, -74.0721, 'Bogotá')
    const route = [pamplona, bogota]

    render(<TripMapGlobe route={route} selectedChallengeId={null} onSelectMoment={() => {}} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    mapInstances[0].fire('load')
    const map = mapInstances[0]

    // El zoom RESULTANTE (estado real del mapa, no qué método se llamó) debe ser
    // el que el BOUNDS necesita — muy por debajo del suelo de relleno. Se lee del
    // propio mapa (`getZoom`), no de los argumentos de la llamada: así la prueba
    // no depende de si el encuadre usa `easeTo`/`flyTo` o `fitBounds`, y detecta
    // igual el bug si el suelo de relleno clampara el resultado por encima.
    const lastZoom = map.getZoom()
    expect(lastZoom).toBeLessThan(MIN_FILL_ZOOM)

    // El suelo del propio mapa (minZoom) queda acotado al zoom que se acaba de
    // aplicar — NUNCA por encima (si no, un futuro resize/interacción podría
    // volver a clampar el bounds).
    expect(map.getMinZoom()).toBeCloseTo(lastZoom, 5)

    // La prueba GEOMÉTRICA real (#640): con el zoom/centro efectivamente
    // aplicados, ambos pines deben proyectarse DENTRO del lienzo (390×844). Bajo
    // el bug (zoom forzado a MIN_FILL_ZOOM sobre el centro del bounds), ambos
    // caerían a cientos de píxeles fuera por cada lado.
    const pPamplona = map.project([pamplona.lng, pamplona.lat])
    const pBogota = map.project([bogota.lng, bogota.lat])
    for (const p of [pPamplona, pBogota]) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(CONTAINER.width)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(CONTAINER.height)
    }
  })

  test('viaje de un solo pin: zoom de ciudad (no de calle) y centrado en el pin', async () => {
    const soloPin = point('unico', 42.8169, -1.6432, 'Pamplona')

    render(<TripMapGlobe route={[soloPin]} selectedChallengeId={null} onSelectMoment={() => {}} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    mapInstances[0].fire('load')
    const map = mapInstances[0]

    // Estado RESULTANTE del mapa (no los argumentos de la llamada): centrado en
    // el pin, zoom de ciudad.
    expect(map.getCenter()).toEqual({ lng: soloPin.lng, lat: soloPin.lat })
    const zoom = map.getZoom()
    // Sensato: nivel ciudad, ni continente (demasiado lejos) ni calle (demasiado
    // cerca, zoom ≥ ~15 en la convención de MapLibre/Leaflet).
    expect(zoom).toBeGreaterThan(MIN_FILL_ZOOM)
    expect(zoom).toBeLessThan(15)
    // El suelo nunca queda por encima del zoom usado.
    expect(map.getMinZoom()).toBeLessThanOrEqual(zoom)
  })
})
