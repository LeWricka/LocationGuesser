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

const CASE = 'home-dashboard-lleno'
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
  // dejar que enganche a RAISED. El scroll interno es el hijo scrollable de la hoja.
  const scroll = sheet.locator('div').last()
  const box = await scroll.boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width / 2
  const cy = box!.y + box!.height / 2

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
