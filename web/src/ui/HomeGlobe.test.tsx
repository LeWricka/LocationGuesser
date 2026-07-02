import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import type { GlobePin } from './HomeGlobe'

// --- Doble mínimo de maplibre-gl -------------------------------------------------
// HomeGlobe importa el motor dinámicamente (`import('maplibre-gl')`) dentro de un
// efecto, así que un `vi.mock` estático basta: intercepta también el import dinámico.
// El doble solo necesita registrar QUÉ se le pide (opciones del Marker, llamadas a
// fitBounds/easeTo) para que los tests verifiquen el fix de #516 sin levantar WebGL
// de verdad.
type Handler = () => void

class MockMap {
  handlers: Record<string, Handler[]> = {}
  fitBoundsCalls: unknown[] = []
  easeToCalls: unknown[] = []
  opts: Record<string, unknown>
  constructor(opts: Record<string, unknown>) {
    this.opts = opts
    mapInstances.push(this)
  }
  on(event: string, handler: Handler) {
    ;(this.handlers[event] ??= []).push(handler)
    return this
  }
  off() {
    return this
  }
  addSource() {}
  addLayer() {}
  setProjection() {}
  fitBounds(bounds: unknown, opts: unknown) {
    this.fitBoundsCalls.push({ bounds, opts })
  }
  easeTo(opts: unknown) {
    this.easeToCalls.push(opts)
  }
  getCenter() {
    return { lng: 0, lat: 0 }
  }
  setCenter() {}
  stop() {}
  remove() {}
  /** Dispara los handlers registrados con `on(event, …)` (simula 'load' del mapa real). */
  fire(event: string) {
    for (const h of this.handlers[event] ?? []) h()
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

describe('HomeGlobe — culling de la cara oculta del globo (#516)', () => {
  test('crea cada Marker con opacityWhenCovered: 0 (oculto en vez de atenuado al 20%)', async () => {
    render(<HomeGlobe pins={samplePins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    mapInstances[0].fire('load')
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
    mapInstances[0].fire('load')
    await waitFor(() => expect(markerInstances).toHaveLength(2))

    expect(mapInstances[0].fitBoundsCalls).toHaveLength(0)
    expect(mapInstances[0].easeToCalls).toHaveLength(0)
  })

  test('framing "pins" (por defecto) SÍ reencuadra a los pines', async () => {
    render(<HomeGlobe pins={samplePins()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    mapInstances[0].fire('load')
    await waitFor(() => expect(mapInstances[0].fitBoundsCalls).toHaveLength(1))
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
