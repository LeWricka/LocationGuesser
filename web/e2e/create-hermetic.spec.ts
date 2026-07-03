import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import {
  test,
  expect,
  primeHermeticCreate,
  HERMETIC_GROUP_ID,
  HERMETIC_CHALLENGE_ID,
} from './helpers/hermetic'

// E2E HERMÉTICO del bucle de crear reto (#443, actualizado #485, #509 y #585).
// Mockea sesión + Supabase + Google Maps + geolocalización, así que corre SIEMPRE
// (local y CI) sin secretos ni escribir en BD, y es determinista. Cubre lo que el
// dueño pidió cazar, sobre el flujo EN DOS PASOS de #585:
//   1) CAMINO FELIZ: tocar el mapa → "Confirmar sitio" → paso 2 (previa SV +
//      reglas) → lanzar → volver al VIAJE (#509: el creador ya no aterriza jugando
//      su propio reto) y, si abre el deep link del reto, ve la guarda "Este reto
//      es tuyo" (no el juego).
//   2) STREET VIEW NO DISPONIBLE: el aviso inline y el CTA deshabilitado viven en
//      el paso 2; "Cambiar sitio" vuelve al mapa CONSERVANDO el pin.
//   3) MÓVIL: el paso 1 entero — mapa protagonista, elegir punto, CTA
//      "Confirmar sitio" accesible sin scroll.
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

// Recorre el flujo de crear ¿Dónde? EN DOS PASOS (#585): el mapa a pantalla
// completa para elegir el sitio (paso 1, CTA "Confirmar sitio" al haber pin) y
// la previa de SV + reglas + Lanzar (paso 2). La búsqueda del panorama arranca
// al tocar el mapa y su resultado se muestra en el paso 2.
// `streetViewAvailable` controla si el mock de Maps devuelve panorama o rechaza.
async function runCreateFlow(page: Page, opts: { streetViewAvailable: boolean }): Promise<void> {
  // Selector de tipo → ¿Dónde? → abre CreateLocationChallenge con el mapa.
  await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

  // PASO 1 — el sitio: el mapa Leaflet es la escena (todo el alto disponible).
  const map = page.locator('.leaflet-container')
  await expect(map).toBeVisible({ timeout: 20_000 })

  // Simular clic en el mapa para elegir el punto (acción principal del usuario).
  // El mock de findPanorama responde al instante; el resultado depende de svAvailable.
  await map.click({ position: { x: 180, y: 200 } })

  // Con pin: aparece el CTA fijo "Confirmar sitio" (no espera al resultado de
  // la búsqueda de SV; ese estado vive en el paso 2). Confirmar avanza de paso.
  const confirmBtn = page.getByRole('button', { name: /Confirmar este sitio/ })
  await expect(confirmBtn).toBeVisible({ timeout: 20_000 })
  await expect(confirmBtn).toBeEnabled()
  await confirmBtn.click()

  if (opts.streetViewAvailable) {
    // PASO 2, camino feliz: cobertura SV → previa grande + reglas + CTA habilitado.
    // El CTA de lanzar conserva el nombre accesible "Este es mi sitio: lanzar…".
    const launchBtn = page.getByRole('button', {
      name: /Este es mi sitio/,
    })
    await expect(launchBtn).toBeVisible({ timeout: 20_000 })
    await expect(launchBtn).toBeEnabled()
    // Las reglas (plazo + tiempo por jugada) acompañan a la previa en este paso.
    await expect(page.getByText('Plazo', { exact: true })).toBeVisible()
    await expect(page.getByText('Tiempo por jugada', { exact: true })).toBeVisible()

    // Lanzar el reto: un solo clic en el CTA.
    await launchBtn.evaluate((el) => (el as HTMLButtonElement).click())
  } else {
    // PASO 2, sin cobertura SV: aviso inline "Sin Street View aquí" + CTA
    // deshabilitado; "Cambiar sitio" queda como salida (vuelve al mapa
    // conservando el pin).
    await expect(page.getByText('Sin Street View aquí')).toBeVisible({ timeout: 20_000 })
    const launchBtn = page.getByRole('button', { name: /Sin Street View/ })
    await expect(launchBtn).toBeVisible({ timeout: 5_000 })
    await expect(launchBtn).toBeDisabled()
    // La vuelta al paso 1 CONSERVA el pin: el CTA "Confirmar sitio" sigue
    // disponible sin volver a tocar el mapa (#585).
    await page.getByRole('button', { name: 'Cambiar sitio' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Confirmar este sitio/ })).toBeVisible({
      timeout: 5_000,
    })
    // Fin del test: sin cobertura el flujo queda detenido hasta que el usuario
    // elija otro punto con cobertura.
    return
  }

  // Microcelebración ("¡Reto lanzado!") y, tras ella, la hoja "comparte el enlace":
  // el reto YA está creado (el INSERT respondió 201). Su aparición es la señal de éxito.
  await expect(page.getByText('¡Reto lanzado!')).toBeVisible({ timeout: 15_000 })
  const shareDialog = page.getByRole('dialog')
  await expect(shareDialog.getByRole('heading', { name: '¡Reto creado!' })).toBeVisible({
    timeout: 15_000,
  })

  // "Ver el reto en el viaje" vuelve a la página del VIAJE (#g=…, sin &c=): tras
  // crear, el creador NO aterriza jugando su propio reto (#509); su reto se ve en
  // el diario y el deep link es para repartirlo al grupo.
  await page.getByRole('button', { name: /Ver el reto en el viaje/ }).click()
  await page.waitForFunction(
    () => location.hash.includes('#g=') && !location.hash.includes('&c='),
    { timeout: 30_000 },
  )
  // Prueba de que es la pantalla Viaje: el FAB de crear vuelve a estar disponible.
  await expect(page.getByRole('button', { name: 'Crear momento o reto' })).toBeVisible({
    timeout: 20_000,
  })
}

// Comprueba el deep link del reto recién creado ABIERTO POR SU CREADOR (#509): la
// sesión hermética ES el creador (created_by = usuario mockeado), así que en vez del
// juego debe montar la guarda "Este reto es tuyo" (con "Ver marcador" / "Volver al
// viaje"), nunca el overlay «Empezar». El harness solo tiene UN usuario (la sesión
// va sembrada en localStorage), así que el caso "otro usuario juega el deep link"
// no se puede simular aquí sin infraestructura nueva; lo cubren los unit tests de
// PlayChallenge (flujo normal para un reto ajeno).
async function assertCreatorSeesOwnChallengeGuard(page: Page): Promise<void> {
  // Navegación SUAVE al deep link (hashchange, sin recarga): igual que seguir el
  // enlace dentro de la app. El auto-join normaliza a `#g=…&c=…`, que es el mismo
  // hash, así que no lo reescribe.
  await page.evaluate(
    ([g, c]) => {
      location.hash = `#g=${g}&c=${c}`
    },
    [HERMETIC_GROUP_ID, HERMETIC_CHALLENGE_ID] as const,
  )

  // Guarda del creador: estado "Este reto es tuyo", sin juego (no hay «Empezar»).
  await expect(page.getByText('Este reto es tuyo')).toBeVisible({ timeout: 20_000 })
  // El mock de votos devuelve []: el creador ve que nadie ha jugado aún.
  await expect(page.getByText('Nadie ha votado todavía.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ver marcador/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empezar' })).not.toBeVisible()
  // El hash apunta al reto concreto que creamos (no a otro): confirma que el deep
  // link que ofrece la tarjeta de compartir lleva de verdad a ESTE reto.
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain(`c=${HERMETIC_CHALLENGE_ID}`)

  // "Volver al viaje" saca al creador de la guarda y aterriza en la página del
  // viaje. Hay dos controles con ese nombre (BackHomeButton arriba + el botón de la
  // tarjeta); pulsamos el de la tarjeta (el último), que es el CTA del estado.
  await page.getByRole('button', { name: 'Volver al viaje' }).last().click()
  await page.waitForFunction(
    () => location.hash.includes('#g=') && !location.hash.includes('&c='),
    { timeout: 20_000 },
  )
}

test.describe('crear reto (hermético)', () => {
  test('camino feliz: elegir punto en mapa → confirmar sitio → previa SV → lanzar → volver al viaje; el creador ve "Este reto es tuyo" en su deep link, sin errores', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: true })
    // El bucle no acaba al crear: el deep link tiene que ser ALCANZABLE. Pero el
    // creador no lo juega (#509): al abrirlo ve la guarda "Este reto es tuyo".
    await assertCreatorSeesOwnChallengeGuard(page)

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Sin cobertura de SV en el punto elegido: aviso inline + CTA deshabilitado (en
  // el paso 2, #585). "Cambiar sitio" devuelve al mapa conservando el pin para
  // elegir otra calle con cobertura.
  test('Street View NO disponible → aviso inline en la previa y CTA deshabilitado', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await primeHermeticCreate(page, { streetViewAvailable: false })

    await openCreateFromTrip(page)
    await runCreateFlow(page, { streetViewAvailable: false })

    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })

  // Paso 1 en viewport de teléfono (#585): el mapa es la escena (todo el alto bajo
  // la cabecera), el usuario elige punto y el CTA fijo "Confirmar sitio" queda
  // accesible dentro del viewport SIN scroll (es un footer en flujo, no tapa nada).
  test('reto de lugar en móvil: mapa visible, elegir punto, CTA accesible', async ({ page }) => {
    // Teléfono típico (iPhone-ish).
    await page.setViewportSize({ width: 390, height: 844 })
    await primeHermeticCreate(page, { streetViewAvailable: true })

    await openCreateFromTrip(page)
    await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

    // El mapa Leaflet es el protagonista del paso 1: carga a pantalla (todo el
    // alto bajo la cabecera, ya sin panel inferior que lo encoja).
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible({ timeout: 20_000 })

    // Elegir punto en el mapa: aparece el CTA fijo "Confirmar sitio".
    await map.click({ position: { x: 190, y: 200 } })

    const confirmBtn = page.getByRole('button', { name: /Confirmar este sitio/ })
    await expect(confirmBtn).toBeVisible({ timeout: 20_000 })
    await expect(confirmBtn).toBeEnabled()
    // CTA fijo como footer en flujo: SIEMPRE dentro del viewport, sin scroll.
    await expect(confirmBtn).toBeInViewport()
    // Y el mapa sigue visible con el CTA presente (el footer no lo tapa).
    await expect(map).toBeInViewport()

    // No hay foto ni historia: este flujo es el GeoGuessr puro, no el asistente
    // inmersivo de foto.
    await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).not.toBeVisible()
  })
})
