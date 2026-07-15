import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import type { GlobePin, GlobeRoute } from './HomeGlobe'

// --- Doble mínimo de maplibre-gl -------------------------------------------------
// HomeGlobe importa el motor dinámicamente (`import('maplibre-gl')`) dentro de un
// efecto, así que un `vi.mock` estático basta: intercepta también el import dinámico.
// El doble solo necesita registrar QUÉ se le pide (opciones del Marker, llamadas a
// fitBounds/easeTo) para que los tests verifiquen el fix de #516 sin levantar WebGL
// de verdad.
type Handler = { handler: () => void; once?: boolean }

/** Registro de un `addSource`/`addLayer` de línea (issue #702: rutas del globo). */
interface AddSourceCall {
  id: string
  coordinates: unknown
}
interface AddLayerCall {
  id: string
  color: unknown
  dash: unknown
}
interface SetPaintPropertyCall {
  layerId: string
  prop: string
  value: unknown
}

class MockMap {
  handlers: Record<string, Handler[]> = {}
  fitBoundsCalls: unknown[] = []
  easeToCalls: unknown[] = []
  jumpToCalls: unknown[] = []
  // Issue #702: registro de fuentes/capas de línea (rutas) + recoloreos, para que
  // los tests de jerarquía protagonista/tenue puedan inspeccionar qué se pidió.
  addSourceCalls: AddSourceCall[] = []
  addLayerCalls: AddLayerCall[] = []
  setPaintPropertyCalls: SetPaintPropertyCall[] = []
  removeLayerCalls: string[] = []
  removeSourceCalls: string[] = []
  private sourcesById = new Map<string, unknown>()
  opts: Record<string, unknown>
  constructor(opts: Record<string, unknown>) {
    this.opts = opts
    mapInstances.push(this)
  }
  on(event: string, handler: () => void) {
    ;(this.handlers[event] ??= []).push({ handler })
    return this
  }
  // `once` (real API de MapLibre): HomeGlobe lo usa para el REVELADO del lienzo en
  // el primer `idle` ("perf(cargas): entrada sin saltos") — mismo patrón que ya
  // tenía el doble de TripMapGlobe.test.tsx.
  once(event: string, handler: () => void) {
    ;(this.handlers[event] ??= []).push({ handler, once: true })
    return this
  }
  off() {
    return this
  }
  addSource(id: string, source: { type: string; data?: { geometry?: { coordinates?: unknown } } }) {
    this.sourcesById.set(id, source)
    // Solo nos interesan las fuentes GeoJSON de línea (la ruta, #702) — el basemap/
    // labels raster de la home NO son lo que estos tests quieren inspeccionar.
    if (source.type === 'geojson') {
      this.addSourceCalls.push({ id, coordinates: source?.data?.geometry?.coordinates })
    }
  }
  getSource(id: string): { setData: (data: unknown) => void } | undefined {
    if (!this.sourcesById.has(id)) return undefined
    return {
      setData: (data: unknown) => {
        this.sourcesById.set(id, { data })
      },
    }
  }
  addLayer(layer: { id: string; type: string; paint?: Record<string, unknown> }) {
    // Igual que `addSource`: solo registramos capas `line` (rutas, #702), no el
    // basemap/labels raster que la home añade siempre tras 'load'.
    if (layer.type !== 'line') return
    this.addLayerCalls.push({
      id: layer.id,
      color: layer.paint?.['line-color'],
      dash: layer.paint?.['line-dasharray'],
    })
  }
  setPaintProperty(layerId: string, prop: string, value: unknown) {
    this.setPaintPropertyCalls.push({ layerId, prop, value })
  }
  removeLayer(id: string) {
    this.removeLayerCalls.push(id)
  }
  removeSource(id: string) {
    this.removeSourceCalls.push(id)
  }
  setProjection() {}
  fitBounds(bounds: unknown, opts: unknown) {
    this.fitBoundsCalls.push({ bounds, opts })
  }
  easeTo(opts: unknown) {
    this.easeToCalls.push(opts)
  }
  jumpTo(opts: unknown) {
    this.jumpToCalls.push(opts)
  }
  getCenter() {
    return { lng: 0, lat: 0 }
  }
  setCenter() {}
  stop() {}
  remove() {}
  getContainer(): HTMLElement | undefined {
    return this.opts.container as HTMLElement | undefined
  }
  /** Dispara los handlers registrados con `on`/`once` (simula 'load'/'idle'/'dragstart'/…). */
  fire(event: string) {
    const list = this.handlers[event] ?? []
    this.handlers[event] = list.filter((h) => {
      h.handler()
      return !h.once
    })
  }
}

class MockMarker {
  lngLat: [number, number] | null = null
  opts: Record<string, unknown>
  constructor(opts: Record<string, unknown>) {
    this.opts = opts
    markerInstances.push(this)
  }
  setLngLat(ll: [number, number]) {
    this.lngLat = ll
    return this
  }
  addTo() {
    return this
  }
  /** Elemento HTML del marker (real API de maplibre-gl): HomeGlobe lo usa para
   * alternar la clase "lead" sin reconstruir el marker (ver `applyActiveLead`). */
  getElement(): HTMLElement {
    return this.opts.element as HTMLElement
  }
  remove() {}
}

class MockLngLatBounds {
  sw: unknown
  ne: unknown
  constructor(sw: unknown, ne: unknown) {
    this.sw = sw
    this.ne = ne
  }
}

let mapInstances: MockMap[] = []
let markerInstances: MockMarker[] = []

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  Marker: MockMarker,
  LngLatBounds: MockLngLatBounds,
}))
// El CSS del motor no aporta nada al test (no hay lienzo real); vaciarlo evita que
// vitest intente resolverlo como si fuera JS.
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

import { HomeGlobe } from './HomeGlobe'

beforeEach(() => {
  mapInstances = []
  markerInstances = []
  // `hasWebGL()` sondea `canvas.getContext('webgl2'|'webgl')`: jsdom no implementa
  // WebGL de verdad, así que sin este stub el componente cae siempre al globo
  // EVOCADO (sin motor real) y nunca llegaríamos a crear el Map/Marker que queremos
  // inspeccionar.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as unknown as RenderingContext,
  )
})

function samplePins(): GlobePin[] {
  return [
    { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
    { id: 'sidney', lat: -33.8688, lng: 151.2093, title: 'Sídney', imageUrl: null, targetId: 't2' },
  ]
}

// Pines AGRUPADOS (mismo continente): el fit inicial usa fitBounds (sin easeTo), así
// que los tests de vuelo por `activeTargetId` pueden contar easeTo en absoluto sin
// que la política de protagonista intercontinental (MAX_FIT_SPAN_*) les meta ruido.
function clusteredPins(): GlobePin[] {
  return [
    { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
    { id: 'roma', lat: 41.8902, lng: 12.4922, title: 'Roma', imageUrl: null, targetId: 't2' },
  ]
}

// Arranque COMPLETO del mapa del doble: 'load' (estilo listo → cámara encuadrada,
// instantánea) + 'idle' (primer frame con teselas → REVELADO del lienzo y montaje
// de los pines). Desde "perf(cargas): entrada sin saltos" los markers montan en el
// primer `idle`, no en `load`, y los vuelos animados (700ms) solo existen DESPUÉS
// del revelado — antes, toda cámara es instantánea (duration 0). Los tests que
// necesiten el estado intermedio (cargado pero sin revelar) disparan 'load' a pelo.
// `act`: el revelado hace un setState (la clase del fundido del lienzo).
function bootMap(map: MockMap) {
  act(() => {
    map.fire('load')
    map.fire('idle')
  })
}

// Simula prefers-reduced-motion (mismo patrón que CountUp.test.tsx/TripPage.test.tsx):
// jsdom no implementa `matchMedia` por defecto.
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HomeGlobe — culling de la cara oculta del globo (#516)', () => {
  test('crea cada Marker con opacityWhenCovered: 0 (oculto en vez de atenuado al 20%)', async () => {
    render(<HomeGlobe pins={samplePins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    for (const marker of markerInstances) {
      expect(marker.opts).toMatchObject({ anchor: 'bottom', opacityWhenCovered: 0 })
    }
  })

  test('framing "world" no reencuadra aunque los pines estén repartidos por todo el planeta', async () => {
    // Constelación real de homeDemoPins.ts: Lisboa/Sídney están casi antípodas. Con
    // el framing por defecto ('pins') un fitBounds a esto forzaría una cámara
    // ESTÁTICA que deja media constelación en la cara oculta para siempre (la causa
    // real del bug reportado: pines "en sitios imposibles"). En 'world' NO se
    // reencuadra: la vista fija + la deriva van revelando cada pin a su vez.
    render(<HomeGlobe pins={samplePins()} framing="world" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    expect(mapInstances[0].fitBoundsCalls).toHaveLength(0)
    expect(mapInstances[0].easeToCalls).toHaveLength(0)
  })

  test('framing "pins" con pines AGRUPADOS (mismo continente): fitBounds a todos', async () => {
    const iberia: GlobePin[] = [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      { id: 'roma', lat: 41.8902, lng: 12.4922, title: 'Roma', imageUrl: null, targetId: 't2' },
    ]
    render(<HomeGlobe pins={iberia} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].fitBoundsCalls).toHaveLength(1))
    expect(mapInstances[0].easeToCalls).toHaveLength(0)
  })

  test('framing "pins" INTERCONTINENTAL: manda el protagonista, no el centroide', async () => {
    // El caso real del dueño (Japón + Maldivas + Colombia): fitBounds sobre pines
    // casi antípodas centra la cámara en océano abierto con los pines en los bordes.
    // Pasado MAX_FIT_SPAN_* la cámara va al pin `lead` a zoom de pin único.
    const pins: GlobePin[] = [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      {
        id: 'sidney',
        lat: -33.8688,
        lng: 151.2093,
        title: 'Sídney',
        imageUrl: null,
        targetId: 't2',
        lead: true,
      },
    ]
    render(<HomeGlobe pins={pins} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].easeToCalls).toHaveLength(1))
    expect(mapInstances[0].fitBoundsCalls).toHaveLength(0)
    const call = mapInstances[0].easeToCalls[0] as { center: [number, number] }
    expect(call.center).toEqual([151.2093, -33.8688])
  })

  test('framing "pins" intercontinental SIN lead: manda el primero', async () => {
    render(<HomeGlobe pins={samplePins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].easeToCalls).toHaveLength(1))
    const call = mapInstances[0].easeToCalls[0] as { center: [number, number] }
    expect(call.center).toEqual([-9.1393, 38.7223])
  })
})

// --- Anillos de sónar del pin "Te toca jugar" sin jugar (issue #776) --------------
describe('HomeGlobe — pin "pending" (reto pendiente): anillos de sónar (#776)', () => {
  test('pin con `pending`: clase + 2 anillos de sónar desfasados; el resto, sin ellos', async () => {
    const pins: GlobePin[] = [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      {
        id: 'sidney',
        lat: -33.8688,
        lng: 151.2093,
        title: 'Sídney',
        imageUrl: null,
        targetId: 't2',
        pending: true,
      },
    ]
    render(<HomeGlobe pins={pins} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    const [lisboaEl, sidneyEl] = markerInstances.map((m) => m.getElement())
    expect(lisboaEl.classList.contains('lg-home-pin--pending')).toBe(false)
    expect(lisboaEl.querySelectorAll('.lg-home-pin__sonar')).toHaveLength(0)

    expect(sidneyEl.classList.contains('lg-home-pin--pending')).toBe(true)
    const rings = sidneyEl.querySelectorAll<HTMLElement>('.lg-home-pin__sonar')
    expect(rings).toHaveLength(2)
    // Desfasados a mitad de ciclo (no sincronizados): la onda se lee continua.
    expect(rings[0].style.getPropertyValue('--sonar-delay')).toBe('0s')
    expect(rings[1].style.getPropertyValue('--sonar-delay')).toBe('1.25s')
  })

  test('sin `pending` en ningún pin: ningún marker lleva la clase ni anillos', async () => {
    render(<HomeGlobe pins={samplePins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    for (const marker of markerInstances) {
      const el = marker.getElement()
      expect(el.classList.contains('lg-home-pin--pending')).toBe(false)
      expect(el.querySelectorAll('.lg-home-pin__sonar')).toHaveLength(0)
    }
  })
})

// --- Regresión #523: el pin "lead" (Roma) caía sobre el Congo ---------------------
//
// Causa raíz REAL: NO es una animación CSS ni una proyección manual (las dos
// hipótesis obvias), sino un choque de ESPECIFICIDAD entre dos hojas de estilo.
// MapLibre posiciona el Marker aplicando `style.transform` directamente sobre el
// elemento que le pasamos (`new Marker({ element: el })`, sin wrapper propio —
// ver `node_modules/maplibre-gl/src/ui/marker.ts#_update`) y espera que ese
// elemento sea `.maplibregl-marker { position: absolute; top: 0; left: 0 }` (su
// CSS base). Pero `.lg-trip-pin:has(.lg-trip-pin__disc)` (tripPins.css) tiene la
// MISMA especificidad (0,2,0) y llega DESPUÉS en la cascada, así que gana y pone
// `position: relative`. Con `position: relative` el pin ya no sale del flujo:
// como los markers del globo de la home son hijos DIRECTOS y en orden del mismo
// contenedor (sin wrapper que los aísle), cada uno apila su alto (42px) en flujo
// de bloque DEBAJO del anterior, sumándose al `translate()` correcto de MapLibre.
// El primer pin (offset 0) cae bien de pura casualidad; el resto se desplaza
// `índice × 42px` — el pin "lead" (Roma, el último de la constelación demo) es
// el más afectado, con 210px de más hacia abajo: suficiente para caer del
// Mediterráneo al Congo.
//
// Este test monta las hojas de estilo REALES (tripPins.css + HomeGlobe.module.css,
// en el mismo orden que las importa HomeGlobe.tsx) en jsdom —cuyo motor de
// selectores (nwsapi) sí resuelve `:has()` y la cascada por especificidad/orden—
// y comprueba `position` computado, exactamente la propiedad que rompía el
// posicionamiento. Sin el fix (quitando `position/top/left` de la regla
// `:global(.lg-trip-pin.lg-home-pin)` en HomeGlobe.module.css) este test falla:
// `getComputedStyle(el).position` vuelve a ser `'relative'`.
describe('HomeGlobe — pin "lead" no se sale de position:absolute (#523)', () => {
  function loadRealStylesheets(): void {
    const tripCss = fs.readFileSync(
      path.resolve(__dirname, '../features/trip/tripPins.css'),
      'utf8',
    )
    // `HomeGlobe.module.css` usa `:global(...)` (sintaxis de CSS Modules, no CSS
    // válido suelto): para las reglas `:global(X)` el output compilado es
    // literalmente `X` (esa es la semántica de "global" — sin scoping). Quitamos
    // el wrapper para inyectar el CSS resultante tal cual lo vería el navegador.
    const homeCssRaw = fs.readFileSync(path.resolve(__dirname, './HomeGlobe.module.css'), 'utf8')
    const homeCssGlobal = homeCssRaw.replace(/:global\(([^)]+)\)/g, '$1')

    // Base real de MapLibre (`maplibre-gl/dist/maplibre-gl.css`), la que el propio
    // motor asume para CUALQUIER Marker con `element` custom.
    const style = document.createElement('style')
    style.textContent = `
      .maplibregl-marker { left: 0; position: absolute; top: 0; will-change: transform; }
      ${tripCss}
      ${homeCssGlobal}
    `
    document.head.appendChild(style)
  }

  // Réplica del markup que `buildPinElement`/`buildHomePinElement` (pinMarkers.ts)
  // generan para un pin-foto cerrado del globo de la home.
  function homePinElement(lead: boolean): HTMLElement {
    const el = document.createElement('div')
    el.className = ['lg-trip-pin', 'lg-home-pin', lead ? 'lg-home-pin--lead' : '']
      .filter(Boolean)
      .join(' ')
    el.classList.add('maplibregl-marker', 'maplibregl-marker-anchor-bottom')
    const disc = document.createElement('span')
    disc.className = 'lg-trip-pin__disc'
    el.appendChild(disc)
    document.body.appendChild(el)
    return el
  }

  test('el pin normal de la home queda position:absolute (no relative)', () => {
    loadRealStylesheets()
    const el = homePinElement(false)
    expect(getComputedStyle(el).position).toBe('absolute')
  })

  test('el pin "lead" de la home TAMBIÉN queda position:absolute (no relative)', () => {
    loadRealStylesheets()
    const el = homePinElement(true)
    expect(getComputedStyle(el).position).toBe('absolute')
  })
})

// --- #567: globo reactivo — prop `activeTargetId` -------------------------------
describe('HomeGlobe — vuelo + "lead" reactivos a `activeTargetId` (#567)', () => {
  test('cambiar a un targetId con pin: vuela (easeTo) a su centro y le pone "lead", retirándoselo al anterior', async () => {
    // Roma arranca "lead" por DATO (`pin.lead`), como el pin más reciente de un
    // viaje real. Al activar Lisboa por `activeTargetId`, el override debe ganarle
    // la exclusividad aunque Roma la trajera horneada desde el propio dato.
    const pins: GlobePin[] = [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      {
        id: 'roma',
        lat: 41.8902,
        lng: 12.4922,
        title: 'Roma',
        imageUrl: null,
        targetId: 't2',
        lead: true,
      },
    ]
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    const [lisboaEl, romaEl] = markerInstances.map((m) => m.getElement())
    expect(romaEl.classList.contains('lg-home-pin--lead')).toBe(true)
    expect(lisboaEl.classList.contains('lg-home-pin--lead')).toBe(false)
    expect(mapInstances[0].easeToCalls).toHaveLength(0)

    rerender(<HomeGlobe pins={pins} activeTargetId="t1" />)

    expect(lisboaEl.classList.contains('lg-home-pin--lead')).toBe(true)
    expect(romaEl.classList.contains('lg-home-pin--lead')).toBe(false)
    expect(mapInstances[0].easeToCalls).toHaveLength(1)
    expect(mapInstances[0].easeToCalls[0]).toMatchObject({
      center: [-9.1393, 38.7223],
      duration: 700,
    })
  })

  test('activeTargetId null/undefined: no vuela y no toca el "lead" (comportamiento actual intacto)', async () => {
    const pins = clusteredPins()
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    rerender(<HomeGlobe pins={pins} activeTargetId={undefined} />)

    expect(mapInstances[0].easeToCalls).toHaveLength(0)
    expect(mapInstances[0].jumpToCalls).toHaveLength(0)
    for (const marker of markerInstances) {
      expect(marker.getElement().classList.contains('lg-home-pin--lead')).toBe(false)
    }
  })

  test('un targetId sin pin correspondiente es un no-op (ni clase ni cámara)', async () => {
    const pins = clusteredPins()
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    rerender(<HomeGlobe pins={pins} activeTargetId="no-existe" />)

    expect(mapInstances[0].easeToCalls).toHaveLength(0)
    for (const marker of markerInstances) {
      expect(marker.getElement().classList.contains('lg-home-pin--lead')).toBe(false)
    }
  })

  test('prefers-reduced-motion: salto directo (easeTo duration:0), sin animación', async () => {
    mockReducedMotion(true)
    const pins = clusteredPins()
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    rerender(<HomeGlobe pins={pins} activeTargetId="t2" />)

    // Issue #693: `jumpTo` (real API de MapLibre) NO admite `offset` — con reduced-
    // motion el salto directo pasa a `easeTo({ duration: 0, offset })` (mismo salto
    // instantáneo, pero SÍ puede aterrizar en la banda visible por encima del dock).
    expect(mapInstances[0].jumpToCalls).toHaveLength(0)
    expect(mapInstances[0].easeToCalls).toHaveLength(1)
    expect(mapInstances[0].easeToCalls[0]).toMatchObject({
      center: [12.4922, 41.8902],
      duration: 0,
    })
    expect(markerInstances[1].getElement().classList.contains('lg-home-pin--lead')).toBe(true)
  })

  test('gesto en curso (drag): el resaltado se aplica pero el vuelo se cancela, no se encola', async () => {
    const pins = clusteredPins()
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    mapInstances[0].fire('dragstart')
    rerender(<HomeGlobe pins={pins} activeTargetId="t2" />)

    // Con el gesto en curso: "lead" sí, vuelo no (cancelado, no pendiente).
    expect(markerInstances[1].getElement().classList.contains('lg-home-pin--lead')).toBe(true)
    expect(mapInstances[0].easeToCalls).toHaveLength(0)

    mapInstances[0].fire('dragend')
    // Al soltar NO se relanza sola (era cancelación, no cola): sigue sin volar hasta
    // que `activeTargetId` cambie de nuevo.
    expect(mapInstances[0].easeToCalls).toHaveLength(0)

    rerender(<HomeGlobe pins={pins} activeTargetId="t1" />)
    expect(mapInstances[0].easeToCalls).toHaveLength(1)
    expect(markerInstances[0].getElement().classList.contains('lg-home-pin--lead')).toBe(true)
    expect(markerInstances[1].getElement().classList.contains('lg-home-pin--lead')).toBe(false)
  })
})

// --- #700: globo poblado — encuadre del RECORRIDO del viaje protagonista ---------
//
// Con todos los momentos de todos los viajes clavados en el globo, el encuadre por
// defecto ya no puede ser "todos los pines" (centroide sin sentido): es el recorrido
// del viaje ACTIVO (`activeTargetId`, que HomeDashboard pasa desde el arranque con el
// primer viaje del carrusel). Los pines del resto de viajes quedan clavados fuera del
// encuadre. Spans elegidos > MIN_FIT_SPAN_DEG (1.2°) para que el ensanchado
// anti-amontonamiento no toque los bounds y podamos asertar valores exactos.
describe('HomeGlobe — encuadre del recorrido del viaje protagonista (#700)', () => {
  // t1: recorrido ibérico (2 pines); t2: un pin suelto casi antípoda (Sídney). Si el
  // fit incluyera a t2, el span sería intercontinental y saldría un easeTo (#699), no
  // un fitBounds: que el arranque haga fitBounds YA demuestra que t2 quedó fuera.
  function tripPins(): GlobePin[] {
    return [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      { id: 'madrid', lat: 40.4168, lng: -3.7038, title: 'Madrid', imageUrl: null, targetId: 't1' },
      {
        id: 'sidney',
        lat: -33.8688,
        lng: 151.2093,
        title: 'Sídney',
        imageUrl: null,
        targetId: 't2',
      },
    ]
  }

  test('arranque con activeTargetId: fitBounds SOLO sobre los pines del protagonista', async () => {
    render(<HomeGlobe pins={tripPins()} activeTargetId="t1" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].fitBoundsCalls).toHaveLength(1))
    expect(mapInstances[0].easeToCalls).toHaveLength(0)

    // Bounds EXACTOS del recorrido de t1 (Lisboa–Madrid): Sídney fuera.
    const { bounds } = mapInstances[0].fitBoundsCalls[0] as { bounds: MockLngLatBounds }
    expect(bounds.sw).toEqual([-9.1393, 38.7223])
    expect(bounds.ne).toEqual([-3.7038, 40.4168])
    // El "lead" del arranque recae en el pin MÁS RECIENTE del protagonista (el último
    // de su recorrido, orden cronológico ASC), no en el primero.
    expect(markerInstances[1].getElement().classList.contains('lg-home-pin--lead')).toBe(true)
    expect(markerInstances[0].getElement().classList.contains('lg-home-pin--lead')).toBe(false)
  })

  test('cambiar activeTargetId a un viaje con varios pines: fit de SU recorrido', async () => {
    const pins: GlobePin[] = [
      ...tripPins(),
      { id: 'roma', lat: 41.8902, lng: 12.4922, title: 'Roma', imageUrl: null, targetId: 't3' },
      { id: 'paris', lat: 48.8566, lng: 2.3522, title: 'París', imageUrl: null, targetId: 't3' },
    ]
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId="t1" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].fitBoundsCalls).toHaveLength(1))

    rerender(<HomeGlobe pins={pins} activeTargetId="t3" />)

    expect(mapInstances[0].fitBoundsCalls).toHaveLength(2)
    const { bounds } = mapInstances[0].fitBoundsCalls[1] as { bounds: MockLngLatBounds }
    expect(bounds.sw).toEqual([2.3522, 41.8902])
    expect(bounds.ne).toEqual([12.4922, 48.8566])
    // El "lead" pasa en exclusiva al pin más reciente del viaje nuevo (París, el
    // último de t3).
    expect(markerInstances[4].getElement().classList.contains('lg-home-pin--lead')).toBe(true)
    expect(markerInstances[1].getElement().classList.contains('lg-home-pin--lead')).toBe(false)
  })

  test('viaje activo de un solo pin: easeTo como siempre (sin fitBounds nuevo)', async () => {
    const pins = tripPins()
    const { rerender } = render(<HomeGlobe pins={pins} activeTargetId="t1" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].fitBoundsCalls).toHaveLength(1))

    rerender(<HomeGlobe pins={pins} activeTargetId="t2" />)

    expect(mapInstances[0].fitBoundsCalls).toHaveLength(1)
    expect(mapInstances[0].easeToCalls).toHaveLength(1)
    expect(mapInstances[0].easeToCalls[0]).toMatchObject({
      center: [151.2093, -33.8688],
      zoom: 2.2,
      duration: 700,
    })
  })

  test('recorrido del viaje activo intercontinental: manda su pin más reciente (#699)', async () => {
    // Un MISMO viaje con pines casi antípodas (raro, pero posible): su fit caería en
    // el centroide oceánico, así que aplica la política de protagonista de #699 sobre
    // su propio recorrido — easeTo a su pin más reciente (el último, orden ASC).
    const pins: GlobePin[] = [
      { id: 'lisboa', lat: 38.7223, lng: -9.1393, title: 'Lisboa', imageUrl: null, targetId: 't1' },
      {
        id: 'sidney',
        lat: -33.8688,
        lng: 151.2093,
        title: 'Sídney',
        imageUrl: null,
        targetId: 't1',
      },
    ]
    render(<HomeGlobe pins={pins} activeTargetId="t1" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].easeToCalls).toHaveLength(1))
    expect(mapInstances[0].fitBoundsCalls).toHaveLength(0)
    const call = mapInstances[0].easeToCalls[0] as { center: [number, number] }
    expect(call.center).toEqual([151.2093, -33.8688])
  })
})

// --- #702: rutas doradas por viaje en el globo ------------------------------------
describe('HomeGlobe — rutas doradas por viaje (#702)', () => {
  /** Color EFECTIVO de una capa: el último `setPaintProperty` recibido (recoloreo
   * barato, ver `applyRouteEmphasis`) o, si no hubo ninguno, el color con el que se
   * creó la capa (`addLayer`). */
  function currentColor(map: MockMap, layerId: string): unknown {
    const lastSetPaint = [...map.setPaintPropertyCalls].reverse().find((c) => c.layerId === layerId)
    if (lastSetPaint) return lastSetPaint.value
    return map.addLayerCalls.find((c) => c.id === layerId)?.color
  }

  test('ruta con ≥2 puntos: addSource/addLayer con las coordenadas en el MISMO ORDEN de entrada', async () => {
    const routes: GlobeRoute[] = [
      {
        targetId: 't1',
        points: [
          [-9.1393, 38.7223], // Lisboa
          [2.3522, 48.8566], // París
          [12.4922, 41.8902], // Roma
        ],
      },
    ]
    render(<HomeGlobe pins={clusteredPins()} routes={routes} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].addSourceCalls).toHaveLength(1))

    // Sin reordenar: exactamente el mismo array de `points` que se le pasó.
    expect(mapInstances[0].addSourceCalls[0].coordinates).toEqual(routes[0].points)
    expect(mapInstances[0].addLayerCalls).toHaveLength(1)
    expect(mapInstances[0].addLayerCalls[0].id).toBe('lg-home-route-line-t1')
  })

  test('ruta con 1 solo punto: no se llama addSource/addLayer para ella', async () => {
    const routes: GlobeRoute[] = [{ targetId: 't1', points: [[-9.1393, 38.7223]] }]
    render(<HomeGlobe pins={clusteredPins()} routes={routes} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    expect(mapInstances[0].addSourceCalls).toHaveLength(0)
    expect(mapInstances[0].addLayerCalls).toHaveLength(0)
  })

  test('la ruta cuyo targetId es el activeTargetId recibe el color protagonista; el resto, tenue', async () => {
    const routes: GlobeRoute[] = [
      {
        targetId: 't1',
        points: [
          [-9.1393, 38.7223],
          [12.4922, 41.8902],
        ],
      },
      {
        targetId: 't2',
        points: [
          [151.2093, -33.8688],
          [174.7633, -36.8485],
        ],
      },
    ]
    render(<HomeGlobe pins={clusteredPins()} routes={routes} activeTargetId="t1" />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].addLayerCalls).toHaveLength(2))

    const map = mapInstances[0]
    const activeColor = currentColor(map, 'lg-home-route-line-t1')
    const inactiveColor = currentColor(map, 'lg-home-route-line-t2')
    expect(activeColor).toBeTruthy()
    expect(inactiveColor).toBeTruthy()
    expect(activeColor).not.toBe(inactiveColor)
  })

  test('al cambiar activeTargetId (rerender), el énfasis se recalcula vía setPaintProperty', async () => {
    const routes: GlobeRoute[] = [
      {
        targetId: 't1',
        points: [
          [-9.1393, 38.7223],
          [12.4922, 41.8902],
        ],
      },
      {
        targetId: 't2',
        points: [
          [151.2093, -33.8688],
          [174.7633, -36.8485],
        ],
      },
    ]
    const { rerender } = render(
      <HomeGlobe pins={clusteredPins()} routes={routes} activeTargetId="t1" />,
    )

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    await waitFor(() => expect(mapInstances[0].addLayerCalls).toHaveLength(2))

    const map = mapInstances[0]
    const before1 = currentColor(map, 'lg-home-route-line-t1')
    const before2 = currentColor(map, 'lg-home-route-line-t2')
    expect(before1).not.toBe(before2)

    rerender(<HomeGlobe pins={clusteredPins()} routes={routes} activeTargetId="t2" />)

    // La ruta que era protagonista pasa a tenue y viceversa: cada una toma el color
    // que antes tenía la otra.
    const after1 = currentColor(map, 'lg-home-route-line-t1')
    const after2 = currentColor(map, 'lg-home-route-line-t2')
    expect(after1).toBe(before2)
    expect(after2).toBe(before1)
  })
})

// --- "perf(cargas): entrada sin saltos" — el mapa primero, los puntos después -----
//
// La entrada de la home encadenaba varios pasos visibles que juntos leían como
// "refrescos": lienzo negro → teselas a trozos → paneo de cámara de 700ms → pines
// de golpe. La coreografía nueva: (1) la cámara encuadra INSTANTÁNEA en `load`,
// con el lienzo aún a opacity 0; (2) el canvas funde a visible en el primer
// `idle`; (3) los pines montan en ese revelado con entrada escalonada (CSS,
// tokens --motion-*); los repintados posteriores no la repiten.
describe('HomeGlobe — revelado del lienzo y entrada de pines (perf: cargas sin saltos)', () => {
  test('los pines NO montan en `load`: montan en el primer `idle` (el revelado)', async () => {
    render(<HomeGlobe pins={clusteredPins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    act(() => mapInstances[0].fire('load'))
    // El estilo cargó y la cámara ya está encuadrada, pero el lienzo sigue oculto:
    // ningún marker todavía ("el mapa primero…").
    expect(markerInstances).toHaveLength(0)
    expect(mapInstances[0].fitBoundsCalls).toHaveLength(1)

    act(() => mapInstances[0].fire('idle'))
    // …"los puntos después": el revelado monta los pines.
    expect(markerInstances).toHaveLength(2)
  })

  test('el encuadre inicial es INSTANTÁNEO (duration 0) aunque NO haya reduced-motion', async () => {
    // Sin stub de matchMedia (sin reduced-motion): la instantaneidad viene de que
    // el lienzo aún no se ha revelado, no de la preferencia del usuario.
    render(<HomeGlobe pins={clusteredPins()} activeTargetId={null} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    act(() => mapInstances[0].fire('load'))

    expect(mapInstances[0].fitBoundsCalls).toHaveLength(1)
    const { opts } = mapInstances[0].fitBoundsCalls[0] as { opts: { duration: number } }
    expect(opts.duration).toBe(0)
  })

  test('primer pintado tras el revelado: entrada escalonada; repintados posteriores, sin ella', async () => {
    const pins = clusteredPins()
    const { rerender } = render(<HomeGlobe pins={pins} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    bootMap(mapInstances[0])
    expect(markerInstances).toHaveLength(2)
    markerInstances.forEach((marker, i) => {
      const el = marker.getElement()
      expect(el.classList.contains('lg-pin-enter')).toBe(true)
      // Retardo escalonado por índice sobre los tokens de motion.
      expect(el.style.getPropertyValue('--pin-enter-delay')).toContain(`* ${i}`)
    })

    // Repintado por DATOS (llega un pin nuevo): pines quietos, sin coreografía —
    // reproducirla en mitad del uso sería un pop-in, no una entrada.
    const more: GlobePin[] = [
      ...pins,
      { id: 'paris', lat: 48.8566, lng: 2.3522, title: 'París', imageUrl: null, targetId: 't3' },
    ]
    rerender(<HomeGlobe pins={more} />)
    // markerInstances acumula TODAS las instancias creadas: 2 del arranque + 3 del
    // repintado (repaint destruye y recrea).
    await waitFor(() => expect(markerInstances).toHaveLength(5))
    for (const marker of markerInstances.slice(2)) {
      expect(marker.getElement().classList.contains('lg-pin-enter')).toBe(false)
    }
  })
})
