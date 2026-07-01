import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import { test, expect, primeHermeticCreate, HERMETIC_GROUP_ID } from './helpers/hermetic'

// E2E HERMÉTICO del bucle de crear reto (#443). Mockea sesión + Supabase + Google
// Maps, así que corre SIEMPRE (local y CI) sin secretos ni escribir en BD, y es
// determinista. Cubre lo que el dueño pidió cazar en CI:
//   1) CAMINO FELIZ: marcar punto + foto → detalles → lanzar → éxito (deep link).
//   2) STREET VIEW NO DISPONIBLE (Maps API negada por dominio, como en prod): al
//      activar Street View la búsqueda falla; el reto se crea IGUAL con solo foto.
// Si el bucle de crear se rompe (gating atascado, insert que peta, regresión de
// props/estado), estos tests lo paran.

// PNG 1x1 mínimo como foto del reto (sin depender de un fichero en disco).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

// Ruido tolerado: terceros (tiles, analítica) y red de Supabase mockeada.
const THIRD_PARTY = [
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
  'maps.googleapis.com',
  'maps.gstatic.com',
  'googleapis.com',
  'gstatic.com',
  'supabase.co',
  'mixpanel.com',
  'mxpnl.com',
]

function isThirdPartyNoise(text: string): boolean {
  if (THIRD_PARTY.some((host) => text.includes(host))) return true
  return /Failed to load resource.*status of \d{3}/.test(text)
}

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isThirdPartyNoise(text)) return
    errors.push(`console.error: ${text}`)
  })
  page.on('pageerror', (err: Error) => {
    errors.push(`pageerror: ${err.message}`)
  })
  page.on('requestfailed', (req: Request) => {
    const url = req.url()
    if (isThirdPartyNoise(url)) return
    errors.push(`requestfailed: ${url} (${req.failure()?.errorText ?? 'unknown'})`)
  })
  return errors
}

// Abre la pantalla Viaje (con sesión + grupo mockeados) y entra al flujo de crear
// reto por el FAB "＋" → "Reto", igual que el usuario real. Cold-navegar a
// `#g=…&add=reto` no vale: el auto-join normaliza el hash y descarta `add=reto`.
async function openCreateFromTrip(page: Page): Promise<void> {
  await page.goto(`/#g=${HERMETIC_GROUP_ID}`)
  const fab = page.getByRole('button', { name: 'Crear momento o reto' })
  await expect(fab).toBeVisible({ timeout: 20_000 })
  await fab.click()
  // El menú del FAB usa role="menuitem"; "Reto" abre el flujo inmersivo.
  await page.getByRole('menuitem', { name: 'Reto' }).click()
}

// Pulsa un botón dentro de la hoja inmersiva. La hoja anima su ALTURA al cambiar de
// etapa y su CTA puede caer por debajo del viewport: un click normal lo ve
// "inestable" o fuera de pantalla. Lo llevamos a la vista y disparamos el click en el
// DOM — el gating de avance vive en el estado de React, no en la geometría, así que
// esto ejercita el mismo camino que un toque real sin depender de la animación.
async function tapSheetButton(page: Page, name: string | RegExp): Promise<void> {
  const btn = page.getByRole('button', { name })
  await expect(btn).toBeEnabled({ timeout: 20_000 })
  // Click en el DOM (no por coordenadas): no depende de que el botón esté dentro del
  // viewport ni de que la hoja haya dejado de animar. React escucha por delegación,
  // así que el click burbujea y dispara el handler igual que un toque real.
  await btn.evaluate((el) => (el as HTMLButtonElement).click())
}

// Recorre el flujo de crear desde el selector de tipo hasta lanzar el reto. Marca el
// punto en el mapa, sube una foto y (opcionalmente) activa Street View por el camino.
async function runCreateFlow(page: Page, opts: { toggleStreetView: boolean }): Promise<void> {
  // Selector de tipo → ¿Dónde? (reto de lugar, flujo de mapa).
  await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

  // Paso lugar: el mapa satélite a sangre con el hint "toca el mapa".
  await expect(page.getByText('marca dónde estás')).toBeVisible({ timeout: 20_000 })
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible()
  await map.click({ position: { x: 180, y: 200 } })

  // Al marcar, aparece el bloque de Street View junto al punto (mismo paso) Y AHÍ SE
  // QUEDA: marcar NO debe auto-avanzar a la foto (regresión #453 — antes saltaba a la
  // etapa "foto" tras 620 ms y el toggle solo parpadeaba, inalcanzable). Esperamos
  // más que esa ventana y comprobamos que el toggle SIGUE visible en el viewport y que
  // NO hemos saltado a la foto todavía.
  const svToggle = page.getByRole('button', { name: 'Añadir Street View' })
  await expect(svToggle).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(900)
  await expect(svToggle).toBeVisible()
  await expect(svToggle).toBeInViewport()
  await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).toBeHidden()

  if (opts.toggleStreetView) {
    // Activar Street View dispara la búsqueda. Con la Maps API negada (mock), la
    // búsqueda falla y NO debe dejar el flujo colgado ni bloquear el avance.
    await tapSheetButton(page, 'Añadir Street View')
    // El estado "Buscando Street View…" no debe quedarse pegado: esperamos a que
    // el gating vuelva a permitir avanzar (el spinner desaparece al degradar).
    await expect(page.getByText('Buscando Street View…')).toBeHidden({ timeout: 15_000 })
  }

  // Avanzar a la foto.
  await tapSheetButton(page, 'Siguiente: la foto')
  await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByLabel('Añadir foto del sitio').setInputFiles({
    name: 'reto.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  })
  // La foto se adjunta y se lee su EXIF (async): hasta que termina, el avance está
  // bloqueado (canAdvanceFromStage[1] = !readingExif). Esperamos a que aparezca la
  // miniatura (control "Cambiar") como señal de que el medio ya está listo.
  await expect(page.getByRole('button', { name: 'Cambiar foto del reto' })).toBeVisible({
    timeout: 15_000,
  })

  // Detalles: nombre del reto.
  await tapSheetButton(page, 'Siguiente: los detalles')
  await expect(page.getByRole('heading', { name: 'Pon las reglas' })).toBeVisible()
  await page.getByLabel('Nombre del reto').fill('¿Dónde desayuné hoy?')

  // Resumen: lanzar. El botón debe HABILITARSE (gating no atascado) y no colgarse.
  await tapSheetButton(page, 'Revisar y lanzar')
  await expect(page.getByRole('heading', { name: 'Lanza el reto' })).toBeVisible()
  await tapSheetButton(page, 'Lanzar reto al grupo')

  // Microcelebración ("¡Reto lanzado!") y, tras ella, la hoja "comparte el enlace"
  // (#330): el reto YA está creado (el INSERT respondió 201). Su aparición, con el
  // título del reto, es la señal de éxito del bucle.
  await expect(page.getByText('¡Reto lanzado!')).toBeVisible({ timeout: 15_000 })
  const shareDialog = page.getByRole('dialog')
  await expect(shareDialog.getByRole('heading', { name: '¡Reto creado!' })).toBeVisible({
    timeout: 15_000,
  })
  // El título aparece en la hoja de resumen (detrás) Y en el diálogo de compartir; lo
  // asertamos DENTRO del diálogo (la señal de éxito es la tarjeta de compartir).
  await expect(shareDialog.getByText('¿Dónde desayuné hoy?')).toBeVisible()

  // "Ver el reto en el viaje" navega al deep link del reto recién creado (#g=…&c=…).
  await page.getByRole('button', { name: /Ver el reto en el viaje/ }).click()
  await page.waitForFunction(() => location.hash.includes('#g=') && location.hash.includes('&c='), {
    timeout: 30_000,
  })
}

test.describe('crear reto (hermético)', () => {
  test('camino feliz: punto + foto → lanzar → deep link, sin errores', async ({ page }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { toggleStreetView: false })

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  test('Street View NO disponible (Maps API negada) → se crea igual con foto', async ({ page }) => {
    const errors = trackErrors(page)
    // La Maps JS API se niega en el navegador: getPanorama RECHAZA (como en prod
    // cuando el dominio no está en los referrers permitidos de la clave).
    await primeHermeticCreate(page, { streetViewAvailable: false })

    await openCreateFromTrip(page)
    // Activamos Street View EN EL CAMINO: debe degradar (aviso) y NO bloquear crear.
    await runCreateFlow(page, { toggleStreetView: true })

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Regresión #453 EN MÓVIL: el dueño soltó el pin en un reto de lugar y "Añadir
  // Street View" NO aparecía. La causa era el auto-avance de etapa al marcar (saltaba
  // a "foto", donde no hay SV). En un viewport de teléfono comprobamos que, tras
  // soltar el pin, el toggle está VISIBLE y dentro del viewport (por encima del
  // pliegue), que se puede ACTIVAR y que seguimos en la etapa de lugar.
  test('reto de lugar en móvil: soltar el pin muestra «Añadir Street View» accesible', async ({
    page,
  }) => {
    // Teléfono típico (iPhone-ish): el bug era invisible en el viewport alto del CI.
    await page.setViewportSize({ width: 390, height: 667 })
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()
    await expect(page.getByText('marca dónde estás')).toBeVisible({ timeout: 20_000 })

    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
    await map.click({ position: { x: 180, y: 200 } })

    // Tras marcar, el toggle aparece y SE QUEDA (no parpadea ni auto-avanza): esperamos
    // más que la vieja ventana de 620 ms.
    const svToggle = page.getByRole('button', { name: 'Añadir Street View' })
    await expect(svToggle).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(900)
    await expect(svToggle).toBeVisible()
    // Accesible = dentro del viewport del teléfono (por encima del pliegue de la hoja).
    await expect(svToggle).toBeInViewport()
    // Seguimos en la etapa de lugar: NO hemos saltado a la foto.
    await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).toBeHidden()

    // Y se puede activar: con Maps disponible, monta la previa (findPanorama devuelve
    // el panorama mockeado). El toggle queda marcado (aria-pressed).
    await tapSheetButton(page, 'Añadir Street View')
    await expect(svToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Buscando Street View…')).toBeHidden({ timeout: 15_000 })
  })
})
