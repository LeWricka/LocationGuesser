import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
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
