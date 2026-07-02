import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import {
  test,
  expect,
  primeHermeticCreate,
  HERMETIC_GROUP_ID,
  HERMETIC_CHALLENGE_ID,
} from './helpers/hermetic'

// E2E HERMÉTICO del bucle de crear reto (#443, actualizado #473). Mockea sesión +
// Supabase + Google Maps + geolocalización, así que corre SIEMPRE (local y CI) sin
// secretos ni escribir en BD, y es determinista. Cubre lo que el dueño pidió cazar:
//   1) CAMINO FELIZ: GPS + SV → lanzar → éxito (deep link jugable).
//   2) STREET VIEW NO DISPONIBLE: sin cobertura → muestra error "Sin Street View aquí".
//   3) MÓVIL: el SV carga y el CTA de lanzar es accesible en viewport de teléfono.
// Si el bucle de crear se rompe (gating atascado, insert que peta, regresión de
// props/estado), estos tests lo paran.

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

// Recorre el flujo de crear ¿Dónde? GeoGuessr puro: GPS → SV → lanzar (sin mapa ni
// foto). El flujo nuevo abre directamente el Street View desde la posición GPS y el
// creador lanza con un solo botón. `streetViewAvailable` controla si el mock de Maps
// devuelve un panorama (true) o rechaza la búsqueda (false = sin cobertura).
async function runCreateFlow(page: Page, opts: { streetViewAvailable: boolean }): Promise<void> {
  // Selector de tipo → ¿Dónde? → abre CreateLocationChallenge directamente.
  await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

  if (opts.streetViewAvailable) {
    // Camino feliz: GPS OK + cobertura SV → el botón de lanzar aparece habilitado.
    // El mock de geolocalización responde en 50 ms; findPanorama resuelve al instante.
    // Esperamos a que el CTA de lanzar aparezca (señal de que el SV está montado).
    const launchBtn = page.getByRole('button', {
      name: /Este es mi sitio/,
    })
    await expect(launchBtn).toBeVisible({ timeout: 20_000 })
    await expect(launchBtn).toBeEnabled()

    // Lanzar el reto: un solo clic en el CTA (sin mapa, sin foto, sin pasos).
    await launchBtn.evaluate((el) => (el as HTMLButtonElement).click())
  } else {
    // Sin cobertura SV: el overlay de error aparece ("Sin Street View aquí") y el
    // botón de lanzar NO aparece. Verificamos que el flujo no se atasca ni revienta.
    await expect(page.getByText('Sin Street View aquí')).toBeVisible({ timeout: 20_000 })
    // Fin del test: no hay CTA de lanzar cuando no hay cobertura — es el comportamiento
    // esperado. El test de "sin cobertura" valida SOLO que el error se muestra.
    return
  }

  // Microcelebración ("¡Reto lanzado!") y, tras ella, la hoja "comparte el enlace":
  // el reto YA está creado (el INSERT respondió 201). Su aparición es la señal de éxito.
  await expect(page.getByText('¡Reto lanzado!')).toBeVisible({ timeout: 15_000 })
  const shareDialog = page.getByRole('dialog')
  await expect(shareDialog.getByRole('heading', { name: '¡Reto creado!' })).toBeVisible({
    timeout: 15_000,
  })

  // "Ver el reto en el viaje" navega al deep link del reto recién creado (#g=…&c=…).
  await page.getByRole('button', { name: /Ver el reto en el viaje/ }).click()
  await page.waitForFunction(() => location.hash.includes('#g=') && location.hash.includes('&c='), {
    timeout: 30_000,
  })
}

// Comprueba el TRASPASO crear → jugar: abre el deep link del reto recién creado y
// verifica que PlayChallenge monta en estado JUGABLE (overlay «Empezar»). No jugamos
// la partida (el mapa de Google y su `idle` no son deterministas en un mock); solo
// asertamos que el reto que se creó es ALCANZABLE y arranca la partida — que es donde
// más duele que se rompa el bucle. El deep link ya está en el hash tras runCreateFlow.
async function assertCreatedChallengeIsPlayable(page: Page): Promise<void> {
  // Cargamos el deep link ya presente en el hash. El overlay «Empezar» (Modal) tapa la
  // escena, así que el mapa/Street View NO se montan aún: llegar aquí no depende de
  // Google Maps. Si getChallenge/getExistingVote fallaran, no habría overlay.
  await expect(page.getByRole('heading', { name: '¿Listo para jugar?' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible()
  // El hash apunta al reto concreto que creamos (no a otro): confirma que el deep link
  // que ofrece la tarjeta de compartir lleva de verdad a ESTE reto.
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain(`c=${HERMETIC_CHALLENGE_ID}`)
}

test.describe('crear reto (hermético)', () => {
  test('camino feliz: punto + foto → lanzar → deep link jugable, sin errores', async ({ page }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: true })
    // El bucle no acaba al crear: el reto tiene que quedar JUGABLE. Seguimos el deep
    // link y comprobamos que PlayChallenge arranca (overlay «Empezar»).
    await assertCreatedChallengeIsPlayable(page)

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Sin cobertura de SV en el GPS actual: el flujo muestra un overlay de error
  // ("Sin Street View aquí") en vez de bloquear o reventar. El CTA de lanzar
  // no aparece, el flujo queda recuperable (botón "Reintentar").
  test('Street View NO disponible → se muestra error "Sin Street View aquí"', async ({ page }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: false })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: false })

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Flujo GeoGuessr en viewport de teléfono: el SV ocupa toda la pantalla a sangre y
  // el CTA de lanzar es accesible (dentro del viewport) sin necesidad de hacer scroll.
  test('reto de lugar en móvil: el SV carga y el CTA de lanzar es accesible', async ({ page }) => {
    // Teléfono típico (iPhone-ish).
    await page.setViewportSize({ width: 390, height: 667 })
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

    // El CTA de lanzar aparece cuando el SV está montado (GPS + findPanorama OK).
    const launchBtn = page.getByRole('button', { name: /Este es mi sitio/ })
    await expect(launchBtn).toBeVisible({ timeout: 20_000 })
    await expect(launchBtn).toBeEnabled()
    // El botón debe estar dentro del viewport del teléfono: ni tapado ni fuera de pantalla.
    await expect(launchBtn).toBeInViewport()
    // No hay mapa ni foto: el SV es la escena completa.
    await expect(page.locator('.leaflet-container')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).not.toBeVisible()
  })
})
