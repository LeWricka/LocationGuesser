import { type Route, expect, test } from '@playwright/test'

// Guardarraíl del GESTO de expansión de la hoja por scroll (issue #417). La hoja del
// patrón globo + hoja (GlobeSheet) se agranda al hacer scroll/swipe hacia arriba cuando el
// contenido está en el tope, y se recoge al hacer scroll hacia abajo con la hoja subida
// (nested scroll, ver useSheetScrollExpand). Este test es HERMÉTICO (sin red externa) y
// dispara `wheel` sintéticos sobre el scroll interno de la hoja, comprobando que su `top`
// (que sigue a `topFrac`) CAMBIA en la dirección esperada.
//
// Nota: la galería NO reproduce el tacto real (touchmove del dedo); el dueño valida eso en
// el móvil. Aquí solo aseguramos que la coordinación scroll↔expansión está cableada y no
// regresiona (que el gesto mueve la hoja y engancha).
//
// Caso objetivo: la BIENVENIDA sin viajes (home-vacia), que es la pantalla que CONSERVA
// el patrón globo + hoja tras la home inmersiva (issue #568: la home logueada con viajes
// pasó a escena única SIN hoja, así que ya no ejercita este gesto; su guardia de
// reemplazo vive en gallery-corner-integrity, test de la home inmersiva).

const CASE = 'home-vacia'
const TALL_VP = { width: 390, height: 858 }

const blockExternal = (route: Route) => {
  const url = route.request().url()
  if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  return route.abort()
}

test('gesto scroll: la hoja se agranda al scrollear hacia arriba y se recoge hacia abajo', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, viewport: TALL_VP })
  await context.route('**/*', blockExternal)
  const page = await context.newPage()

  await page.goto(`/gallery.html?case=${encodeURIComponent(CASE)}`)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts?.ready)

  const sheet = page.locator('section[aria-label]').first()
  await expect(sheet).toBeVisible()

  // La hoja arranca en PEEK: su `top` es una fracción grande del visor.
  const topPeek = await sheet.evaluate((el) => el.getBoundingClientRect().top)
  expect(topPeek).toBeGreaterThan(0)

  // Scroll HACIA ARRIBA sobre el scroll interno (deltaY negativo = gesto arriba): debe
  // AGRANDAR la hoja (su top baja hacia 0). Emitimos varios ticks para superar el umbral y
  // dejar que enganche a RAISED. El scroll interno es el ÚNICO hijo <div> directo de la
  // hoja (`.scroll` en GlobeSheet; el otro hijo es el <button> del asa). Antes se cogía el
  // ÚLTIMO div en orden de documento, pero con contenido largo (la bienvenida) ese div cae
  // bajo el pliegue y el wheel no aterrizaba en la hoja.
  const scroll = sheet.locator('xpath=./div').first()
  const box = await scroll.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  // Punto VISIBLE del scroll: su caja llega hasta el fondo del visor, así que el centro
  // vertical del tramo visible (entre su top y el alto del viewport) es un punto seguro.
  const visibleBottom = Math.min(box!.y + box!.height, TALL_VP.height)
  const cy = box!.y + (visibleBottom - box!.y) / 2

  for (let i = 0; i < 8; i++) {
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(30)
  }
  // Deja que el debounce del wheel enganche (snap) + la transición de top.
  await page.waitForTimeout(500)

  const topRaised = await sheet.evaluate((el) => el.getBoundingClientRect().top)
  expect(topRaised, 'scroll arriba debe agrandar la hoja (top menor que en PEEK)').toBeLessThan(
    topPeek - 10,
  )

  // Ahora con la hoja subida y el contenido en el tope, scroll HACIA ABAJO (deltaY positivo)
  // debe RECOGER la hoja (su top vuelve a subir hacia PEEK).
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(500)

  const topBack = await sheet.evaluate((el) => el.getBoundingClientRect().top)
  expect(topBack, 'scroll abajo con hoja subida debe recogerla (top mayor)').toBeGreaterThan(
    topRaised + 10,
  )

  await context.close()
})
