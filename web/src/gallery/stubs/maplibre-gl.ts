// Stub de maplibre-gl para la galería (alias de Vite SOLO en el entry de galería).
// Evita cargar el motor WebGL real y pedir tiles a la red (no determinista), pero
// conserva la API que usan HomeGlobe y TripMapGlobe: el mapa "carga" (dispara
// 'load') sobre un lienzo con la textura de "mapa nocturno de marca" (issue #661,
// ver nightMapTexture.ts) y los MARCADORES SÍ se clavan (sus elementos HTML se
// insertan en el contenedor), así los PINES siguen visibles para la revisión
// visual. Lo demás (tiles, vuelo, proyección) son no-ops deterministas.

import { NIGHT_MAP_TEXTURE_URL } from './nightMapTexture'

type LngLat = [number, number]

interface MapOptions {
  container?: HTMLElement | string
  [key: string]: unknown
}

export class Map {
  private container: HTMLElement | null = null
  private loadCbs: Array<() => void> = []
  private idleCbs: Array<() => void> = []

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
  // Faltaban estos cuatro (issue #652): TripMapGlobe los llama SIN feature-detect
  // (a diferencia de HomeGlobe, que sí comprueba `typeof map.jumpTo === 'function'`
  // antes de usarlo). Sin ellos, la entrada cinematográfica del diario lanzaba un
  // `TypeError` no capturado dentro del handler `load` — abortaba a media
  // ejecución y con ello el registro de `idle` (ver microtarea del constructor):
  // el skeleton del mapa se quedaba colgado hasta su temporizador de red de
  // seguridad (MAP_READY_FALLBACK_MS), más lento que la espera de la galería.
  jumpTo(): this {
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
