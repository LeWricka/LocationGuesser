import path from 'node:path'
import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import { test, expect, hasAuthCreds } from './helpers/authed'

// E2E AUTENTICADO del flujo COMPLETO grupo-primero con el NUEVO flujo INMERSIVO de
// crear reto: arranca con sesión (storageState de global-setup) → Home → crear
// grupo → viaje → FAB "Reto" → mapa satélite a sangre → tocar el mapa marca el punto
// (el pin cae, la hoja sube) → etapa Foto: subir una foto → etapa Detalles: nombre →
// etapa Resumen: "Lanzar reto al grupo" → tras la microcelebración aterrizamos en el
// reto recién creado (deep link #g=…&c=…).
//
// Se SALTA si no hay credenciales (E2E_USER_EMAIL/PASSWORD). OJO: cuando corre, SÍ
// escribe en la BD real (grupo + reto). Usamos un reto SOLO FOTO (sin Street View)
// para no depender de la cobertura de SV en un punto tocado al azar del mapa.

test.skip(!hasAuthCreds, 'Define E2E_USER_EMAIL/E2E_USER_PASSWORD para los E2E autenticados')

// PNG 1x1 mínimo como foto del reto. Evita depender de un fichero en disco.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

// Ruido tolerado: terceros (mapas, Street View, analítica) y red de Supabase.
const THIRD_PARTY = [
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
  'maps.googleapis.com',
  'maps.gstatic.com',
  'streetviewpixels',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'mxpnl.com',
  'mixpanel.com',
  'supabase.co',
  'Google Maps JavaScript API',
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

test.describe('crear completo (autenticado)', () => {
  test('home → crear grupo → reto inmersivo (foto) → deep link, sin errores', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page)

    // 1. Home con sesión. El recién llegado ve el hero con "Crear grupo".
    await page.goto('/')
    await page.getByRole('button', { name: 'Crear grupo' }).click()
    await expect(page.getByRole('heading', { name: 'Crear un grupo' })).toBeVisible({
      timeout: 20_000,
    })

    // 2. Nombrar el grupo y crearlo. Nombre único por ejecución.
    const groupName = `e2e-grupo-${Date.now().toString(36)}`
    await page.getByRole('textbox', { name: 'Nombre del grupo' }).fill(groupName)
    await page.getByRole('button', { name: 'Crear grupo' }).click()

    // 3. El grupo recién creado abre la pantalla "Viaje" (diario visual). El FAB
    //    "＋" despliega el menú Momento / Reto.
    const fab = page.getByRole('button', { name: '＋' })
    await expect(fab).toBeVisible({ timeout: 20_000 })
    await fab.click()
    await page.getByRole('button', { name: 'Reto' }).click()

    // 4. Flujo inmersivo: el mapa satélite a sangre con el hint "toca el mapa".
    await expect(page.getByText('marca dónde estás')).toBeVisible({ timeout: 20_000 })

    // 5. Tocar el mapa marca el punto: el pin cae y la hoja sube a la etapa "foto".
    //    Para un reto SOLO FOTO no hace falta cobertura de Street View.
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()
    await map.click({ position: { x: 180, y: 320 } })

    // 6. Etapa "foto": subimos una foto (input file oculto del PhotoDropzone), que
    //    adjunta el medio del reto.
    await expect(page.getByRole('heading', { name: 'Enseña tu momento' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByLabel('Añadir foto del sitio').setInputFiles({
      name: 'reto.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })

    // 7. Avanzar a "detalles" y poner nombre al reto.
    await page.getByRole('button', { name: 'Siguiente: los detalles' }).click()
    await expect(page.getByRole('heading', { name: 'Pon las reglas' })).toBeVisible()
    await page.getByLabel('Nombre del reto').fill('¿Dónde desayuné hoy?')

    // 8. Avanzar a "resumen" y lanzar el reto.
    await page.getByRole('button', { name: 'Revisar y lanzar' }).click()
    await expect(page.getByRole('heading', { name: 'Lanza el reto' })).toBeVisible()
    const launch = page.getByRole('button', { name: 'Lanzar reto al grupo' })
    await expect(launch).toBeEnabled({ timeout: 20_000 })
    await launch.click()

    // 9. Microcelebración ("¡Reto lanzado!") y, tras ella, aterrizamos en el reto
    //    recién creado: el deep link #g=…&c=… (la pantalla de jugar).
    await expect(page.getByText('¡Reto lanzado!')).toBeVisible({ timeout: 15_000 })
    await page.waitForFunction(
      () => location.hash.includes('#g=') && location.hash.includes('&c='),
      { timeout: 30_000 },
    )

    // Captura del estado final para el reporte.
    const shotPath = path.join(testInfo.project.testDir, '.screenshots', 'crear-completo.png')
    const shot = await page.screenshot({ path: shotPath, fullPage: true })
    await testInfo.attach('crear-completo', { body: shot, contentType: 'image/png' })

    // 10. Higiene: ningún error propio (terceros tolerados).
    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })
})
