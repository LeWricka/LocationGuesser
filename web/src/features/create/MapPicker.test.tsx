import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// --- Regresión #574: el buscador se comía la mitad del alto del mapa ---
//
// Causa raíz REAL: `PlaceSearch.module.css` define su propio `.wrap` con
// `flex: 1` (pensado para cuando comparte fila con el botón de cerrar en
// `.fullscreenTop`, donde SÍ debe crecer para ocupar el ancho). Pero en el
// picker COMPACTO, `.wrap` (este fichero) es una COLUMNA: ese mismo `flex: 1`
// competía por ALTO con `.canvas` (también `flex: 1`) y los repartía a partes
// iguales — en un contenedor de alto definido (p.ej. la pantalla "¿Dónde?",
// con `height: 100%` forzado por CreateLocationChallenge.module.css
// `.mapArea > :first-child`) el buscador se inflaba a ~345px de hueco muerto
// bajo el campo y el mapa se comprimía a la mitad de su alto disponible
// (medido con Playwright: 698px de alto total → 345/345 en vez de ~54/644).
//
// jsdom no calcula layout real (alturas en píxeles), así que este test monta
// la hoja de estilos REAL de `MapPicker.module.css` en jsdom (cuyo motor de
// selectores sí resuelve la cascada) y comprueba, vía `getComputedStyle`, que
// el PRIMER hijo de `.wrap` (la fila del buscador) queda anclado a su alto
// natural (`flex: none` → `flex-grow: 0`) mientras `.canvas` sigue creciendo
// para absorber el resto (`flex-grow: 1`) — mismo patrón que ya usa
// `PlaceSearch.test.tsx` para su regresión de stacking (#574) y
// `Toast.test.tsx` para la suya (#552).
describe('MapPicker — el buscador no se reparte el alto con el mapa (#574)', () => {
  function loadRealStylesheet(): void {
    const css = fs.readFileSync(path.resolve(__dirname, './MapPicker.module.css'), 'utf8')
    const style = document.createElement('style')
    style.textContent = `:root { --space-2: 8px; } ${css}`
    document.head.appendChild(style)
  }

  test('el primer hijo de .wrap (fila del buscador) no crece; .canvas sí', () => {
    loadRealStylesheet()
    const wrap = document.createElement('div')
    wrap.className = 'wrap'
    const searchRow = document.createElement('div')
    const canvas = document.createElement('div')
    canvas.className = 'canvas'
    wrap.append(searchRow, canvas)
    document.body.appendChild(wrap)

    expect(getComputedStyle(searchRow).flexGrow).toBe('0')
    expect(getComputedStyle(canvas).flexGrow).toBe('1')
  })
})
