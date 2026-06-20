import path from 'node:path'
import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

// E2E del flujo COMPLETO grupo-primero (#79): Home → crear grupo (con nombre) →
// página del grupo → añadir reto → marcar un punto con cobertura de Street View
// (Madrid) → esperar a que encaje el panorama → generar el reto pasando por el
// IdentityModal (nombre + PIN) → comprobar que aparece el enlace del reto
// (#g=…&c=…) para compartir.
//
// OJO: a diferencia del smoke, este test SÍ escribe en la BD real (grupo +
// reto). La previa de Street View hace llamadas reales a Google Maps con la key
// pública (localhost está en los referrers permitidos). Es un throwaway
// aceptable para validar el guardado de punta a punta contra Supabase.

// Ruido tolerado: tiles de mapa (CARTO/Esri), Nominatim y Google Maps/Street
// View son terceros y pueden devolver 4xx/5xx puntuales sin que la app esté
// rota.
const THIRD_PARTY = [
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
  'maps.googleapis.com',
  'maps.gstatic.com',
  'streetviewpixels',
  'google.com',
  // El render del panorama puede quejarse si la API key no tiene este referrer
  // exacto autorizado (config de Google Cloud, no de la app). El encaje del
  // panorama vía StreetViewService sí funciona; lo tratamos como ruido externo.
  'Google Maps JavaScript API',
]

function isThirdPartyNoise(text: string): boolean {
  if (THIRD_PARTY.some((host) => text.includes(host))) return true
  // "Failed to load resource: ... status of 4xx/5xx": el navegador no incluye el
  // host en este console.error, pero solo lo emiten recursos externos (tiles,
  // Nominatim con 429 por rate-limit, Google). La app no genera este texto.
  return /Failed to load resource.*status of \d{3}/.test(text)
}

// Engancha los listeners de higiene y devuelve el array donde se acumulan los
// errores inesperados (de consola, JS y peticiones fallidas no-tercero).
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

test.describe('crear completo', () => {
  test('home → crear grupo → añadir reto con Street View → identidad → enlace, sin errores', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page)

    // 1. Home → crear grupo.
    await page.goto('/')
    await page.getByRole('button', { name: 'Crear un grupo' }).click()
    await expect(page.getByRole('heading', { name: 'Crear un grupo' })).toBeVisible()

    // 2. Nombrar el grupo y crearlo. Nombre único por ejecución.
    const groupName = `e2e-grupo-${Date.now().toString(36)}`
    await page.getByRole('textbox', { name: 'Nombre del grupo' }).fill(groupName)
    await page.getByRole('button', { name: 'Crear grupo' }).click()

    // 3. Página del grupo: aparece su nombre y el estado vacío.
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Aún no hay retos — añade el primero.')).toBeVisible()

    // 4. Añadir reto → pantalla de crear reto.
    await page.getByRole('button', { name: '➕ Añadir reto' }).first().click()
    await expect(page.getByRole('heading', { name: 'Crear un reto' })).toBeVisible()

    // 5. Marcar punto via buscador + primera sugerencia. Madrid tiene cobertura
    // de Street View garantizada.
    const searchBox = page.getByRole('textbox', { name: 'Buscar un lugar' })
    await searchBox.fill('Puerta del Sol, Madrid')
    const suggestions = page.getByRole('list').getByRole('button')
    await expect(suggestions.first()).toBeVisible({ timeout: 15_000 })
    await suggestions.first().click()
    await expect(page.getByText('Punto marcado')).toBeVisible()

    // 6. Tras elegir el punto, findPanorama (StreetViewService) encaja el
    // panorama más cercano y aparece la sección de previa, que habilita "Crear
    // reto" (solo activo cuando hay panorama y terminó la comprobación).
    await expect(page.getByLabel('Vista previa de Street View')).toBeVisible({ timeout: 20_000 })

    // 7. Crear reto → con localStorage limpio aparece el IdentityModal.
    const create = page.getByRole('button', { name: 'Crear reto' })
    await expect(create).toBeEnabled({ timeout: 20_000 })
    await create.click()
    await expect(page.getByRole('heading', { name: '¿Quién juega?' })).toBeVisible({
      timeout: 20_000,
    })

    // Nombre único por ejecución para no chocar en el grupo.
    const uniqueName = `e2e-${Date.now().toString(36)}`
    await page.getByRole('textbox', { name: 'Tu nombre' }).fill(uniqueName)
    await page.getByRole('textbox', { name: 'PIN de 4 dígitos' }).fill('1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // 8. De vuelta en el grupo: aparece el panel del reto creado con su enlace
    // (#g= y &c=) para compartir.
    const shareInput = page.getByRole('textbox', { name: 'Mensaje para compartir el reto' })
    await expect(shareInput).toBeVisible({ timeout: 30_000 })
    const shareValue = await shareInput.inputValue()
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('#g=')
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('&c=')

    // Captura del estado final (reto creado en el grupo) para el reporte.
    const shotPath = path.join(testInfo.project.testDir, '.screenshots', 'crear-completo.png')
    const shot = await page.screenshot({ path: shotPath, fullPage: true })
    await testInfo.attach('crear-completo', { body: shot, contentType: 'image/png' })

    // 9. Higiene: ningún error de consola/JS/petición (salvo ruido de terceros).
    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })
})
