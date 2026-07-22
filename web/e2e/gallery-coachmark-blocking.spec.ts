import { type Route, expect, test } from '@playwright/test'

// Guardarraíl del modo BLOQUEANTE de `CoachMark` (issue #888). El bug de #887 —un
// coach-mark `pointer-events:none` sobre un mapa Leaflet/Google VIVO, que arrastraba
// el mapa y dejaba "Siguiente" sin recibir el toque— se escapó porque la galería, el
// a11y y el resto de E2E montan mapas STUBEADOS (planos, sin listeners): el camino
// "toque real contra un elemento interactivo debajo del coach-mark" nunca se
// ejercitó. Este spec SÍ lo ejercita, con un navegador de verdad (jsdom, donde viven
// los tests de CoachMark.test.tsx, IGNORA `pointer-events` al hacer hit-testing —
// por construcción no puede cazar este bug):
//
//   1. El scrim bloqueante CAPTURA el toque: tocar el "mapa" (un botón realmente
//      interactivo, ver CoachMarkBlockingHarness) a través del hueco visual del
//      spotlight NO le llega — nunca cambia a "TOCADO".
//   2. La burbuja + "Siguiente" siguen siendo clicables POR ENCIMA del scrim.
//
// Hermético: bloquea toda red externa (mismo criterio que el resto de specs de
// gallery-a11y.config.ts); sin credenciales ni Supabase/Google Maps reales.

const blockExternal = (route: Route) => {
  const url = route.request().url()
  if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  return route.abort()
}

test('coach-mark bloqueante: el scrim protege el objetivo y "Siguiente" sigue siendo clicable', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } })
  await context.route('**/*', blockExternal)
  const page = await context.newPage()

  await page.goto('/gallery.html?case=onboarding-coachmark-blocking')
  await page.waitForLoadState('networkidle')

  const fakeMap = page.getByTestId('fake-map')
  const nextButton = page.getByRole('button', { name: 'Siguiente' })
  await expect(fakeMap).toBeVisible()
  await expect(nextButton).toBeVisible()

  // La burbuja + "Siguiente" deben estar DENTRO del viewport (issue #888: antes un
  // objetivo alto podía mandar la tarjeta fuera de pantalla).
  const nextBox = await nextButton.boundingBox()
  expect(nextBox, '"Siguiente" debe tener una bounding box medible').not.toBeNull()
  const viewport = page.viewportSize()!
  expect(nextBox!.x).toBeGreaterThanOrEqual(0)
  expect(nextBox!.y).toBeGreaterThanOrEqual(0)
  expect(nextBox!.x + nextBox!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(viewport.height + 1)

  // 1) El scrim bloquea el toque: clic en el CENTRO del "mapa" (bajo el spotlight)
  // no debe llegarle — en un navegador real, `pointer-events:auto` de la capa
  // bloqueante intercepta el clic antes de que toque el botón de debajo.
  const mapBox = (await fakeMap.boundingBox())!
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
  await expect(fakeMap).toHaveText('mapa: intacto')

  // 2) "Siguiente" SÍ recibe el toque por encima del scrim y dispara su handler.
  await nextButton.click()
  await expect(page.getByTestId('coach-done')).toBeVisible()

  await context.close()
})
