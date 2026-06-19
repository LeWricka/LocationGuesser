import path from 'node:path'
import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

// Smoke E2E del bucle de creación (issue #44). NO crea retos reales: el flujo
// llega solo hasta marcar el punto en el mapa, nunca pulsa "Generar enlace",
// así no ensucia la BD ni en prod.

// Ruido tolerado. Los tiles de mapa (CARTO/Esri) y Nominatim son terceros y
// pueden devolver 4xx/5xx puntuales o avisos de atribución sin que la app esté
// rota; no queremos que un fallo de red de un tercero tiña el smoke de rojo.
const THIRD_PARTY = [
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
]

function isThirdPartyNoise(text: string): boolean {
  return THIRD_PARTY.some((host) => text.includes(host))
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

test.describe('smoke', () => {
  test('home → crear → buscar → marcar punto → capa satélite, sin errores', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page)

    // 1. Home: carga y CTA visible.
    await page.goto('/')
    const cta = page.getByRole('button', { name: 'Crear un reto' })
    await expect(cta).toBeVisible()

    // Al pulsar el CTA aparece la pantalla de crear.
    await cta.click()
    await expect(page.getByRole('heading', { name: 'Crear un reto' })).toBeVisible()

    // 2. Buscar (guard de z-index): escribe, espera sugerencias y clica la
    // primera. Si el mapa la tapase (z-index roto), Playwright no podría hacer
    // click y el test fallaría — justo el tipo de bug que queremos cazar.
    const searchBox = page.getByRole('textbox', { name: 'Buscar un lugar' })
    await searchBox.fill('Madrid')

    const suggestions = page.getByRole('list').getByRole('button')
    // Nominatim puede tardar; damos margen al debounce (300ms) + red.
    await expect(suggestions.first()).toBeVisible({ timeout: 15_000 })
    await suggestions.first().click()

    // El badge confirma que el punto quedó marcado.
    await expect(page.getByText('Punto marcado')).toBeVisible()

    // Captura de la pantalla de crear con el punto ya marcado. La guardamos en
    // e2e/.screenshots (gitignoreado) y la adjuntamos también al reporte.
    const shotPath = path.join(testInfo.project.testDir, '.screenshots', 'crear-con-punto.png')
    const shot = await page.screenshot({ path: shotPath, fullPage: true })
    await testInfo.attach('crear-con-punto', { body: shot, contentType: 'image/png' })

    // 3. Capa de mapa: activar Satélite y comprobar su estado.
    const satellite = page.getByRole('button', { name: 'Satélite' })
    await satellite.click()
    await expect(satellite).toHaveAttribute('aria-pressed', 'true')

    // 4. Higiene: ningún error de consola/JS/petición (salvo ruido de terceros).
    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })
})
