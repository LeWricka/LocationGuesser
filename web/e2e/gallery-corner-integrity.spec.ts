import { PNG } from 'pngjs'
import { type Route, expect, test } from '@playwright/test'

// Guardarraíl de INTEGRIDAD DE ESQUINA (issue #415). Caza de forma determinista la clase
// de bug de la home: la hoja blanca inferior (GlobeSheet) tiene esquinas superiores
// redondeadas y se apoya sobre la ESCENA OSCURA del globo; en los triángulos que quedan
// FUERA del arco del `border-radius` asomaba el negro de la escena ("huecos en negro
// detrás de los bordes redondeados").
//
// Cómo lo caza (sin snapshots, 100% determinista y hermético):
//   1. Monta el caso de home a un viewport ALTO (ratio ~2.2, el del dueño), con la escena
//      OSCURA real detrás de la hoja (el shell de GlobeSheet pinta `--scene-bg`).
//   2. Localiza el elemento de la hoja y lee su bounding-box + el radio de sus esquinas
//      superiores (`getComputedStyle`).
//   3. Recorta un cuadradito de píxeles en CADA esquina superior con `page.screenshot`,
//      decodifica el PNG y muestrea los píxeles que caen DENTRO del bounding-box pero
//      FUERA del arco del radio (los triángulos de esquina).
//   4. FALLA si esos píxeles son ~oscuros (escena) en vez del color de PAPEL de la hoja.
//
// Determinismo: el entry de la galería congela el reloj y apaga animaciones; aquí
// bloqueamos toda la red EXTERNA (tiles/SDK/CDN) para que nada fuera de localhost ensucie
// la captura. La escena detrás de la hoja es el propio fondo de escena del shell (oscuro),
// así que el hueco SÍ se manifiesta si el faldón de papel de la hoja desaparece.

// Caso(s) que usan el patrón globo + hoja (GlobeSheet) HOY: la bienvenida sin viajes
// (HomePage, rama sin grupos) y la landing deslogueada. La home logueada CON viajes
// (home-dashboard-lleno / home-con-datos) dejó de tener hoja en la home inmersiva
// (issue #568: escena única, sin papel) — su guardia de reemplazo es el test del dock
// de abajo. Si se añade otra pantalla con hoja sobre escena oscura, se añade aquí.
const SHEET_CASES = ['home-vacia', 'landing-generica']

// Caso(s) de la home INMERSIVA (sin hoja, issue #568): la guardia aquí es que el dock
// del carrusel ("Tus viajes") está visible y la pantalla no desborda a 320px.
const IMMERSIVE_CASES = ['home-dashboard-lleno', 'home-con-datos', 'home-globo-pines-cercanos']
const NARROW_VP = { width: 320, height: 568 }

// Viewport ALTO: reproduce el móvil del dueño (1080×2400 ≈ ratio 2.2). deviceScaleFactor 3
// como su @3x; el muestreo de píxel usa el factor real del PNG (ancho/clientWidth).
const TALL_VP = { width: 390, height: 858 }
const DEVICE_SCALE = 3

// Un píxel se considera OSCURO (= escena filtrándose) si su luminancia percibida es baja.
// La hoja es papel (`--surface` ≈ #ffffff, luminancia ~255); la escena es `--scene-bg`
// (#0b1016, luminancia ~17). El umbral parte el rango con holgura amplia: cualquier cosa
// por debajo es inequívocamente escena, no papel ni la costura clara.
const DARK_LUMA_MAX = 90

// Cuántos px hacia dentro, desde el vértice de la esquina, muestreamos. Justo dentro del
// bbox y bien dentro del triángulo que el arco deja descubierto (para un radio de 28px,
// a 3-5px del vértice la distancia al centro del arco supera el radio → es triángulo).
const SAMPLE_OFFSETS = [3, 4, 5, 6]

const blockExternal = (route: Route) => {
  const url = route.request().url()
  if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  return route.abort()
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test('integridad de esquina: la hoja no muestra escena oscura en sus esquinas', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: TALL_VP,
    deviceScaleFactor: DEVICE_SCALE,
  })
  await context.route('**/*', blockExternal)
  const page = await context.newPage()

  const problems: string[] = []

  for (const caseId of SHEET_CASES) {
    await page.goto(`/gallery.html?case=${encodeURIComponent(caseId)}`)
    await page.waitForLoadState('networkidle')
    // La galería congela animaciones, pero esperamos a fuentes/paint por robustez.
    await page.evaluate(() => document.fonts?.ready)
    await expect(page.locator('#root')).not.toBeEmpty()

    // La hoja: única `<section>` con aria-label dentro del shell del patrón globo + hoja.
    // La localizamos por su rol de región (aria-label la nombra) para no acoplarnos al
    // nombre de la clase CSS-module (hasheado en build). Cae al primer <section> si hiciera
    // falta.
    const sheet = page.locator('section[aria-label]').first()
    await expect(sheet, `[${caseId}] no se encontró la hoja (section[aria-label])`).toBeVisible()

    const geom = await sheet.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const rl = parseFloat(cs.borderTopLeftRadius) || 0
      const rr = parseFloat(cs.borderTopRightRadius) || 0
      return { x: rect.x, y: rect.y, width: rect.width, right: rect.right, rl, rr }
    })

    // Radio efectivo del muestreo (px CSS). Si por lo que sea no hay radio, no hay
    // triángulo que comprobar en ese lado.
    const radiusLeft = Math.round(geom.rl)
    const radiusRight = Math.round(geom.rr)

    // Recorte de captura por esquina: un cuadradito del tamaño del radio, en px CSS.
    // Playwright recorta en px CSS; el PNG sale a deviceScaleFactor, lo escalamos al leer.
    const corners: { name: string; cssX: number; cssY: number; radius: number; side: 'l' | 'r' }[] =
      []
    if (radiusLeft > 0) {
      corners.push({
        name: 'sup-izq',
        cssX: geom.x,
        cssY: geom.y,
        radius: radiusLeft,
        side: 'l',
      })
    }
    if (radiusRight > 0) {
      corners.push({
        name: 'sup-der',
        cssX: geom.right - radiusRight,
        cssY: geom.y,
        radius: radiusRight,
        side: 'r',
      })
    }

    for (const corner of corners) {
      const size = corner.radius + 2
      const buf = await page.screenshot({
        clip: { x: corner.cssX, y: corner.cssY, width: size, height: size },
      })
      const png = PNG.sync.read(buf)
      // Factor real del PNG frente al px CSS del clip (deviceScaleFactor efectivo).
      const scale = png.width / size

      // Centro del arco del radio en px CSS, relativo al origen del clip:
      //  - esquina izquierda: centro a (radius, radius) desde la esquina sup-izq del clip.
      //  - esquina derecha:  el vértice está en la esquina sup-DER del clip → centro a
      //    (size - radius, radius) [el clip empieza `radius` px a la izquierda del canto].
      const arcCx = corner.side === 'l' ? corner.radius : size - corner.radius
      const arcCy = corner.radius

      const darkHits: string[] = []
      let sampled = 0

      for (const off of SAMPLE_OFFSETS) {
        // Vértice del triángulo (la esquina real de la hoja) en px CSS del clip.
        const cssPx = corner.side === 'l' ? off : size - off
        const cssPy = off
        // Fuera del arco = distancia al centro del arco > radio (con margen para no
        // muestrear justo sobre la curva antialiaseada).
        const dx = cssPx - arcCx
        const dy = cssPy - arcCy
        const dist = Math.hypot(dx, dy)
        if (dist <= corner.radius + 1) continue // dentro del arco (es hoja) → no es triángulo

        const px = Math.min(png.width - 1, Math.max(0, Math.round(cssPx * scale)))
        const py = Math.min(png.height - 1, Math.max(0, Math.round(cssPy * scale)))
        const idx = (png.width * py + px) << 2
        const r = png.data[idx]
        const g = png.data[idx + 1]
        const b = png.data[idx + 2]
        const l = luma(r, g, b)
        sampled++
        if (l < DARK_LUMA_MAX) {
          darkHits.push(`(${cssPx},${cssPy}) rgb(${r},${g},${b}) luma=${l.toFixed(0)}`)
        }
      }

      // Debe haberse muestreado al menos un triángulo (si no, la geometría cambió y el
      // guardarraíl dejaría de proteger: lo señalamos).
      if (sampled === 0) {
        problems.push(
          `[${caseId}] esquina ${corner.name}: no se muestreó ningún píxel de triángulo` +
            ` (radio=${corner.radius}); revisa la geometría del test.`,
        )
        continue
      }
      if (darkHits.length > 0) {
        problems.push(
          `[${caseId}] esquina ${corner.name}: ${darkHits.length}/${sampled} píxel(es) de` +
            ` triángulo son ESCENA OSCURA (asoma el fondo tras el radio de la hoja):\n      ` +
            darkHits.join('\n      '),
        )
      }
    }
  }

  await context.close()

  expect(
    problems,
    'Integridad de esquina ROTA — la hoja deja ver la escena oscura tras sus esquinas\n' +
      'redondeadas. Sella el triángulo con un faldón de papel detrás de la hoja\n' +
      '(ver .skirt en GlobeSheet). Detalle:\n\n' +
      problems.join('\n\n'),
  ).toEqual([])
})

// Guardia de REEMPLAZO para la home inmersiva (issue #568): esos casos ya no tienen
// hoja (la escena es única), así que la comprobación de esquina no aplica. Lo que sí
// debe aguantar es su chrome flotante: el dock del carrusel "Tus viajes" visible (si
// desapareciera, la home se queda sin navegación a los viajes) y la pantalla sin
// overflow horizontal ni siquiera a 320px (el carrusel scrollea DENTRO de su propio
// contenedor; un desborde del documento delataría una tarjeta/capa mal contenida).
test('home inmersiva: el carrusel de viajes es visible y no desborda a 320px', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, viewport: NARROW_VP })
  await context.route('**/*', blockExternal)
  const page = await context.newPage()

  const problems: string[] = []

  for (const caseId of IMMERSIVE_CASES) {
    await page.goto(`/gallery.html?case=${encodeURIComponent(caseId)}`)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts?.ready)
    await expect(page.locator('#root')).not.toBeEmpty()

    // El carrusel: lista con aria-label "Tus viajes" (HomeDashboard). Debe estar
    // visible con al menos una tarjeta (viaje o "Nuevo viaje").
    const carousel = page.locator('ul[aria-label="Tus viajes"]')
    await expect(carousel, `[${caseId}] el carrusel "Tus viajes" debe ser visible`).toBeVisible()
    const cards = await carousel.locator('li').count()
    if (cards === 0) {
      problems.push(`[${caseId}] el carrusel no tiene ninguna tarjeta (ni "Nuevo viaje").`)
    }

    // Sin overflow horizontal del DOCUMENTO a 320px (el scroll del carrusel es interno).
    const overflow = await page.evaluate(() => {
      const el = document.documentElement
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    if (overflow.scrollWidth > overflow.clientWidth) {
      problems.push(
        `[${caseId}] desborda a 320px: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
      )
    }
  }

  await context.close()

  expect(
    problems,
    'Home inmersiva ROTA — el dock del carrusel debe flotar sobre la escena sin\n' +
      'desbordar el documento. Detalle:\n\n' +
      problems.join('\n\n'),
  ).toEqual([])
})
