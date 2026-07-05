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
// iguales — en un contenedor de alto definido (p.ej. la pantalla "¿Dónde estamos?",
// con `height: 100%` forzado por CreateLocationChallenge.module.css
// `.mapArea > :first-child`) el buscador se inflaba a ~345px de hueco muerto
// bajo el campo y el mapa se comprimía a la mitad de su alto disponible
// (medido con Playwright: 698px de alto total → 345/345 en vez de ~54/644).
//
// jsdom no calcula layout real (alturas en píxeles), así que este test monta
// la hoja de estilos REAL de `MapPicker.module.css` en jsdom (cuyo motor de
// selectores sí resuelve la cascada) y comprueba, vía `getComputedStyle`, que
// la fila del buscador (`.searchRow`) queda anclada a su alto natural
// (`flex: none` → `flex-grow: 0`) mientras `.canvas` sigue creciendo para
// absorber el resto (`flex-grow: 1`) — mismo patrón que ya usa
// `PlaceSearch.test.tsx` para su regresión de stacking (#574) y
// `Toast.test.tsx` para la suya (#552).
//
// La regla vivía en `.wrap > :first-child` (genérico); pasó a `.searchRow`
// (issue #585) porque con la variante 'overlay' del buscador `.canvas` es el
// ÚNICO/primer hijo de `.wrap` — el selector genérico le habría comido el
// `flex: 1` propio por más especificidad. Este test comprueba que la clase
// explícita solo afecta al elemento que de verdad es la fila del buscador.
describe('MapPicker — el buscador no se reparte el alto con el mapa (#574)', () => {
  function loadRealStylesheet(): void {
    const css = fs.readFileSync(path.resolve(__dirname, './MapPicker.module.css'), 'utf8')
    const style = document.createElement('style')
    style.textContent = `:root { --space-2: 8px; --tap-target: 44px; } ${css}`
    document.head.appendChild(style)
  }

  test('.searchRow (fila del buscador) no crece; .canvas sí', () => {
    loadRealStylesheet()
    const wrap = document.createElement('div')
    wrap.className = 'wrap'
    const searchRow = document.createElement('div')
    searchRow.className = 'searchRow'
    const canvas = document.createElement('div')
    canvas.className = 'canvas'
    wrap.append(searchRow, canvas)
    document.body.appendChild(wrap)

    expect(getComputedStyle(searchRow).flexGrow).toBe('0')
    expect(getComputedStyle(canvas).flexGrow).toBe('1')
  })

  test('variante overlay: .canvas es el único hijo de .wrap y conserva flex-grow: 1', () => {
    loadRealStylesheet()
    const wrap = document.createElement('div')
    wrap.className = 'wrap'
    const canvas = document.createElement('div')
    canvas.className = 'canvas'
    wrap.append(canvas)
    document.body.appendChild(wrap)

    expect(getComputedStyle(canvas).flexGrow).toBe('1')
  })
})
