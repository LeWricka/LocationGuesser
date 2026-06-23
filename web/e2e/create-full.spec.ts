import path from 'node:path'
import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import { test, expect, hasAuthCreds } from './helpers/authed'

// E2E AUTENTICADO del flujo COMPLETO grupo-primero con login (#140): arranca con
// sesión (storageState de global-setup) → Home → crear grupo → página del grupo →
// añadir reto → marcar punto con cobertura de Street View (Madrid) → esperar al
// panorama → crear el reto (la identidad viene de la sesión, ya no hay IdentityModal)
// → comprobar que aparece el enlace del reto (#g=…&c=…) para compartir.
//
// Se SALTA si no hay credenciales (E2E_USER_EMAIL/PASSWORD). OJO: cuando corre, SÍ
// escribe en la BD real (grupo + reto). La previa de Street View llama a Google
// Maps con la key pública. Throwaway aceptable para validar el guardado de punta a
// punta contra Supabase.

test.skip(!hasAuthCreds, 'Define E2E_USER_EMAIL/E2E_USER_PASSWORD para los E2E autenticados')

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
  test('home → crear grupo → reto con Street View → enlace, sin errores', async ({
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

    // 3. Página del grupo: aparece su nombre. El tutorial de onboarding está
    //    pre-marcado como visto (fixture authed), así que no tapa el flujo.
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 20_000 })

    // 4. Añadir reto → pantalla de crear reto.
    await page.getByRole('button', { name: '➕ Añadir reto' }).first().click()
    await expect(page.getByRole('heading', { name: 'Crear un reto' })).toBeVisible()

    // 5. Marcar punto via buscador + primera sugerencia. Madrid tiene cobertura
    //    de Street View garantizada.
    const searchBox = page.getByRole('textbox', { name: 'Buscar un lugar' })
    await searchBox.fill('Puerta del Sol, Madrid')
    const suggestions = page.getByRole('list').getByRole('button')
    await expect(suggestions.first()).toBeVisible({ timeout: 15_000 })
    await suggestions.first().click()
    await expect(page.getByText('Punto marcado')).toBeVisible()

    // 6. Tras elegir el punto, findPanorama encaja el panorama más cercano y
    //    aparece la previa, que habilita "Crear reto".
    await expect(page.getByLabel('Vista previa de Street View')).toBeVisible({ timeout: 20_000 })

    // 7. Crear reto. Con login, la identidad viene de la sesión: ya no hay
    //    IdentityModal; volvemos directos al grupo con el panel de compartir.
    const create = page.getByRole('button', { name: 'Crear reto' })
    await expect(create).toBeEnabled({ timeout: 20_000 })
    await create.click()

    // 8. De vuelta en el grupo: aparece el enlace del reto (#g= y &c=).
    const shareInput = page.getByRole('textbox', { name: 'Mensaje para compartir el reto' })
    await expect(shareInput).toBeVisible({ timeout: 30_000 })
    const shareValue = await shareInput.inputValue()
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('#g=')
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('&c=')

    // Captura del estado final para el reporte.
    const shotPath = path.join(testInfo.project.testDir, '.screenshots', 'crear-completo.png')
    const shot = await page.screenshot({ path: shotPath, fullPage: true })
    await testInfo.attach('crear-completo', { body: shot, contentType: 'image/png' })

    // 9. Higiene: ningún error propio (terceros tolerados).
    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })
})
