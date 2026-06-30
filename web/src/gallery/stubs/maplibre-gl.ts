// Stub de maplibre-gl para la galería (alias de Vite SOLO en el entry de galería).
// Evita cargar el motor WebGL real y pedir tiles a la red (no determinista), pero
// conserva la API que usan HomeGlobe y TripMapGlobe: el mapa "carga" (dispara
// 'load') sobre un lienzo vacío y los MARCADORES SÍ se clavan (sus elementos HTML
// se insertan en el contenedor), así los PINES siguen visibles para la revisión
// visual. Lo demás (tiles, vuelo, proyección) son no-ops deterministas.

type LngLat = [number, number]

interface MapOptions {
  container?: HTMLElement | string
  [key: string]: unknown
}

export class Map {
  private container: HTMLElement | null = null
  private loadCbs: Array<() => void> = []

  constructor(opts: MapOptions = {}) {
    const c = opts.container
    this.container = typeof c === 'string' ? document.getElementById(c) : (c ?? null)
    if (this.container) {
      // Fondo de escena (azul pizarra) para que la zona del globo no quede en
      // blanco; los pines se montan encima.
      this.container.style.background = '#16222e'
    }
    // 'load' en microtarea: deja que el componente registre su callback primero.
    queueMicrotask(() => {
      for (const cb of this.loadCbs) cb()
    })
  }

  on(event: string, cb: () => void): this {
    if (event === 'load') this.loadCbs.push(cb)
    return this
  }
  once(event: string, cb: () => void): this {
    return this.on(event, cb)
  }
  off(): this {
    return this
  }
  setProjection(): this {
    return this
  }
  addSource(): this {
    return this
  }
  addLayer(): this {
    return this
  }
  getSource(): undefined {
    return undefined
  }
  removeLayer(): this {
    return this
  }
  removeSource(): this {
    return this
  }
  easeTo(): this {
    return this
  }
  flyTo(): this {
    return this
  }
  fitBounds(): this {
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

  constructor(opts?: { element?: HTMLElement; anchor?: string }) {
    this.element = opts?.element ?? document.createElement('div')
  }
  setLngLat(lngLat: LngLat): this {
    this.lngLat = lngLat
    return this
  }
  addTo(map: Map): this {
    // Clavamos el elemento del pin en el contenedor del mapa para que se vea en la
    // captura, posicionado de forma estable (centrado): no hay proyección real.
    const container = map.getContainer()
    if (container && this.element) {
      this.element.style.position = 'absolute'
      this.element.style.left = '50%'
      this.element.style.top = '50%'
      this.element.style.transform = 'translate(-50%, -100%)'
      container.appendChild(this.element)
      this.parent = container
    }
    return this
  }
  getElement(): HTMLElement | null {
    return this.element
  }
  remove(): this {
    if (this.parent && this.element && this.element.parentNode === this.parent) {
      this.parent.removeChild(this.element)
    }
    void this.lngLat
    return this
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
