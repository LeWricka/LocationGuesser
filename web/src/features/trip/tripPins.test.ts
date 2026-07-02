import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// --- Regresión #530: pines del mapa del Viaje apilados en flujo de bloque ---------
//
// Mismo bug que #523 (HomeGlobe, PR #528), pero en `TripMapGlobe.tsx`: MapLibre
// posiciona el Marker aplicando `style.transform` DIRECTAMENTE sobre el elemento que
// le pasamos (`new gl.Marker({ element: el })`, sin wrapper propio — ver
// `maplibre-gl/src/ui/marker.ts#_update`) y espera que ese elemento sea
// `.maplibregl-marker { position: absolute; top: 0; left: 0 }` (su CSS base). Pero
// `.lg-trip-pin:has(.lg-trip-pin__disc)` (tripPins.css:46) tiene la MISMA
// especificidad (0,2,0) que `.maplibregl-marker` y, si llega después en la cascada,
// gana y deja `position: relative`. Con `position: relative` el pin ya no sale del
// flujo normal: como los markers de MapLibre son hijos DIRECTOS del mismo
// `canvasContainer` (sin wrapper que los aísle), cada uno apila su alto en flujo de
// bloque DEBAJO del anterior — un offset vertical que se SUMA al `translate()`
// correcto de MapLibre. El primer pin cae bien de pura coincidencia; el resto se
// desplaza `índice × alto del pin` hacia abajo.
//
// FIX (a diferencia de #528, que parcheó localmente en HomeGlobe.module.css
// dependiendo del orden de importación): aquí arreglamos la regla ofensora
// DIRECTAMENTE en tripPins.css, añadiendo `.lg-trip-pin.maplibregl-marker` (misma
// especificidad 0,2,0, después en el MISMO fichero → gana por orden SIEMPRE, sin
// depender de qué otro CSS se importe ni en qué orden) que restaura
// `position: absolute; top: 0; left: 0`. Arregla TripMapGlobe y, de paso, también
// HomeGlobe (que importa el mismo tripPins.css y también crea sus markers con
// `new gl.Marker({ element })`), sin tocar ni depender del parche local de #528.
// Leaflet (`TripMapLeaflet`, `divIcon`) no lleva la clase `.maplibregl-marker` y no
// se ve afectado: sigue con `position: relative` para la puntita `::after`.
//
// Este test monta la hoja de estilo REAL (tripPins.css) en jsdom —cuyo motor de
// selectores (nwsapi) sí resuelve `:has()` y la cascada por especificidad/orden— y
// comprueba `position` computado sobre un elemento que replica el markup real de
// `buildPinElement`/`pinMarkers.ts` CON la clase `.maplibregl-marker` que MapLibre le
// añade al crear el Marker. Sin el fix, `getComputedStyle(el).position` es
// `'relative'` en vez de `'absolute'`.
describe('tripPins.css — el marker de MapLibre no se sale de position:absolute (#530)', () => {
  function loadRealStylesheet(): void {
    const tripCss = fs.readFileSync(path.resolve(__dirname, './tripPins.css'), 'utf8')
    const style = document.createElement('style')
    // Base real de MapLibre (`maplibre-gl/dist/maplibre-gl.css`), la que el propio
    // motor asume para CUALQUIER Marker con `element` custom.
    style.textContent = `
      .maplibregl-marker { left: 0; position: absolute; top: 0; will-change: transform; }
      ${tripCss}
    `
    document.head.appendChild(style)
  }

  // Réplica del markup que `buildPinElement` (pinMarkers.ts) genera para un pin-foto
  // cerrado del mapa de Viaje, con las clases que MapLibre añade al crear el Marker.
  function tripMarkerElement(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'lg-trip-pin'
    el.classList.add('maplibregl-marker', 'maplibregl-marker-anchor-bottom')
    const disc = document.createElement('span')
    disc.className = 'lg-trip-pin__disc'
    el.appendChild(disc)
    document.body.appendChild(el)
    return el
  }

  test('el pin del mapa de Viaje (MapLibre) queda position:absolute (no relative)', () => {
    loadRealStylesheet()
    const el = tripMarkerElement()
    expect(getComputedStyle(el).position).toBe('absolute')
    expect(getComputedStyle(el).top).toBe('0px')
    expect(getComputedStyle(el).left).toBe('0px')
  })

  test('el pin de Leaflet (sin clase maplibregl-marker) conserva position:relative', () => {
    // Leaflet no añade `.maplibregl-marker`: el pin sigue necesitando
    // `position: relative` como ancestro posicionado de la puntita `::after` y el
    // disco `position: absolute; inset: 0`.
    loadRealStylesheet()
    const el = document.createElement('div')
    el.className = 'lg-trip-pin'
    const disc = document.createElement('span')
    disc.className = 'lg-trip-pin__disc'
    el.appendChild(disc)
    document.body.appendChild(el)
    expect(getComputedStyle(el).position).toBe('relative')
  })
})
