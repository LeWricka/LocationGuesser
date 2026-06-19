import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

// E2E del flujo COMPLETO de crear reto (issue #47): sube una imagen real,
// marca el punto, genera el enlace pasando por el IdentityModal (nombre + PIN) y
// comprueba que el enlace resultante apunta al grupo y reto creados.
//
// OJO: a diferencia del smoke, este test SÍ escribe en la BD real (grupo + reto
// + imagen en Storage). Es un throwaway aceptable para validar el guardado de
// punta a punta contra Supabase.

// Ruido tolerado: tiles de mapa (CARTO/Esri) y Nominatim son terceros y pueden
// devolver 4xx/5xx puntuales sin que la app esté rota.
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

// Imagen de prueba: un JPEG real y pequeño versionado en e2e/fixtures.
// El runner es ESM, así que derivamos el dir del propio módulo.
const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(here, 'fixtures', 'foto.jpg')

test.describe('crear completo', () => {
  test('home → crear → foto → punto → identidad → enlace, sin errores', async ({
    page,
  }, testInfo) => {
    const errors = trackErrors(page)

    // 1. Home → pantalla de crear.
    await page.goto('/')
    await page.getByRole('button', { name: 'Crear un reto' }).click()
    await expect(page.getByRole('heading', { name: 'Crear un reto' })).toBeVisible()

    // 2. Subir imagen real. El input file está oculto (lo dispara un botón), pero
    // setInputFiles lo rellena directamente. Tras procesarse aparece la vista previa.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE)
    await expect(page.getByRole('img', { name: 'Vista previa del reto' })).toBeVisible()

    // 3. Marcar punto via buscador + primera sugerencia (patrón del smoke).
    const searchBox = page.getByRole('textbox', { name: 'Buscar un lugar' })
    await searchBox.fill('Madrid')
    const suggestions = page.getByRole('list').getByRole('button')
    await expect(suggestions.first()).toBeVisible({ timeout: 15_000 })
    await suggestions.first().click()
    await expect(page.getByText('Punto marcado')).toBeVisible()

    // 4. Plazo y tiempo: dejamos los defaults (Fin del día / 2 min).

    // 5. Generar enlace → con localStorage limpio aparece el IdentityModal.
    await page.getByRole('button', { name: 'Generar enlace' }).click()
    await expect(page.getByRole('heading', { name: '¿Quién juega?' })).toBeVisible()

    // Nombre único por ejecución para no chocar en el grupo (que es nuevo, pero
    // así también evitamos colisiones si el código de grupo se repitiese).
    const uniqueName = `e2e-${Date.now().toString(36)}`
    await page.getByRole('textbox', { name: 'Tu nombre' }).fill(uniqueName)
    await page.getByRole('textbox', { name: 'PIN de 4 dígitos' }).fill('1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    // 6. Resultado: el enlace para compartir contiene el grupo (#g=) y el reto (&c=).
    // Damos margen amplio: subida a Storage + insert del reto en Supabase.
    const shareInput = page.getByRole('textbox', { name: 'Mensaje para compartir el reto' })
    await expect(shareInput).toBeVisible({ timeout: 30_000 })
    const shareValue = await shareInput.inputValue()
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('#g=')
    expect(shareValue, `Enlace inesperado: ${shareValue}`).toContain('&c=')

    // Captura del estado final (enlace creado) para el reporte.
    const shotPath = path.join(testInfo.project.testDir, '.screenshots', 'crear-completo.png')
    const shot = await page.screenshot({ path: shotPath, fullPage: true })
    await testInfo.attach('crear-completo', { body: shot, contentType: 'image/png' })

    // 7. Higiene: ningún error de consola/JS/petición (salvo ruido de terceros).
    expect(errors, `Errores inesperados durante el flujo:\n${errors.join('\n')}`).toEqual([])
  })
})
