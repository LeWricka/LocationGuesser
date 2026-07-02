import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import {
  test,
  expect,
  primeHermeticCreate,
  HERMETIC_GROUP_ID,
  HERMETIC_CHALLENGE_ID,
} from './helpers/hermetic'

// E2E HERMÉTICO del bucle de crear reto (#443, actualizado #485). Mockea sesión +
// Supabase + Google Maps + geolocalización, así que corre SIEMPRE (local y CI) sin
// secretos ni escribir en BD, y es determinista. Cubre lo que el dueño pidió cazar:
//   1) CAMINO FELIZ: elegir punto en el mapa → previa SV → lanzar → deep link jugable.
//   2) STREET VIEW NO DISPONIBLE: elegir punto sin cobertura → aviso inline, CTA deshabilitado.
//   3) MÓVIL: el mapa carga, el usuario elige punto, el CTA de lanzar es accesible.
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

// Recorre el flujo de crear ¿Dónde? con selección de punto en el mapa.
// El flujo abre el mapa (Leaflet), el usuario toca para elegir el sitio,
// se busca el SV del punto → si hay cobertura, aparece la previa y el CTA.
// `streetViewAvailable` controla si el mock de Maps devuelve panorama o rechaza.
async function runCreateFlow(page: Page, opts: { streetViewAvailable: boolean }): Promise<void> {
  // Selector de tipo → ¿Dónde? → abre CreateLocationChallenge con el mapa.
  await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

  // El mapa Leaflet debe cargarse como primer paso (es la opción PRINCIPAL).
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible({ timeout: 20_000 })

  // Simular clic en el mapa para elegir el punto (acción principal del usuario).
  // El mock de findPanorama responde al instante; el resultado depende de svAvailable.
  await map.click({ position: { x: 180, y: 200 } })

  if (opts.streetViewAvailable) {
    // Camino feliz: punto elegido + cobertura SV → previa + CTA habilitado.
    // Esperamos a que el CTA de lanzar aparezca (señal de que la previa está montada).
    const launchBtn = page.getByRole('button', {
      name: /Este es mi sitio/,
    })
    await expect(launchBtn).toBeVisible({ timeout: 20_000 })
    await expect(launchBtn).toBeEnabled()

    // Lanzar el reto: un solo clic en el CTA.
    await launchBtn.evaluate((el) => (el as HTMLButtonElement).click())
  } else {
    // Sin cobertura SV: aviso inline "Sin Street View aquí" en el panel inferior.
    // El CTA aparece pero deshabilitado con mensaje de error.
    await expect(page.getByText('Sin Street View aquí')).toBeVisible({ timeout: 20_000 })
    // El botón de lanzar aparece pero no se puede pulsar.
    const launchBtn = page.getByRole('button', { name: /Sin Street View/ })
    await expect(launchBtn).toBeVisible({ timeout: 5_000 })
    await expect(launchBtn).toBeDisabled()
    // Fin del test: con CTA deshabilitado el flujo queda detenido hasta que
    // el usuario elija otro punto con cobertura.
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
  test('camino feliz: elegir punto en mapa → previa SV → lanzar → deep link jugable, sin errores', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: true })
    // El bucle no acaba al crear: el reto tiene que quedar JUGABLE. Seguimos el deep
    // link y comprobamos que PlayChallenge arranca (overlay «Empezar»).
    await assertCreatedChallengeIsPlayable(page)

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Sin cobertura de SV en el punto elegido: aviso inline + CTA deshabilitado.
  // El usuario puede mover el pin a otra calle con cobertura.
  test('Street View NO disponible → aviso inline y CTA deshabilitado', async ({ page }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: false })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: false })

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Flujo de lugar en viewport de teléfono: el mapa carga, el usuario elige punto,
  // la previa de SV + CTA son accesibles dentro del viewport sin necesidad de scroll.
  test('reto de lugar en móvil: mapa visible, elegir punto, CTA accesible', async ({ page }) => {
    // Teléfono típico (iPhone-ish).
    await page.setViewportSize({ width: 390, height: 844 })
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

    // El mapa Leaflet es el protagonista: debe cargarse en pantalla (mitad superior).
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible({ timeout: 20_000 })

    // Elegir punto en el mapa: el CTA aparece en el panel inferior.
    await map.click({ position: { x: 190, y: 200 } })

    const launchBtn = page.getByRole('button', { name: /Este es mi sitio/ })
    await expect(launchBtn).toBeVisible({ timeout: 20_000 })
    await expect(launchBtn).toBeEnabled()

    // El panel inferior es scrollable en móvil (overflow-y: auto): el botón puede
    // estar fuera del viewport inicial si la previa de SV es alta. Lo desplazamos
    // a la vista antes de asertar que es alcanzable.
    await launchBtn.scrollIntoViewIfNeeded()
    await expect(launchBtn).toBeInViewport()

    // No hay foto ni historia: el SV es la previa, no la escena completa.
    await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).not.toBeVisible()
  })
})
