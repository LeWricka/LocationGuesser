import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

// Smoke HERMÉTICO (#140): no depende de auth ni escribe en BD. La app ahora exige
// login (magic link), así que el smoke se queda en la puerta: comprueba que la SPA
// monta y que la pantalla de login es visible, sin pulsar nada que toque Supabase.
// Pasa igual en local (`npm run e2e`) y en prod (`npm run e2e:prod`) y es el único
// E2E que corre en CI (no necesita secretos).

// Ruido tolerado: terceros (mapas, analítica) y la propia red de Supabase
// (auth/realtime) pueden emitir avisos sin que la app esté rota. Solo nos
// importan los errores PROPIOS.
const THIRD_PARTY = [
  // Mapas / Street View.
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
  // Analítica.
  'mxpnl.com',
  'mixpanel.com',
  // Supabase: auth/realtime pueden hacer ruido de red sin que la app esté rota.
  'supabase.co',
  // El navegador no incluye el host en este console.error, pero solo lo emiten
  // recursos externos (tiles, Nominatim con 429, Google). La app no lo genera.
  'Google Maps JavaScript API',
]

function isThirdPartyNoise(text: string): boolean {
  if (THIRD_PARTY.some((host) => text.includes(host))) return true
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

test.describe('smoke', () => {
  test('la SPA monta y muestra la pantalla de login, sin errores propios', async ({ page }) => {
    const errors = trackErrors(page)

    // 1. Carga la raíz: cualquier ruta sin sesión cae al login.
    await page.goto('/')

    // 2. La SPA montó: #root tiene contenido (no quedó en blanco).
    const root = page.locator('#root')
    await expect(root).not.toBeEmpty()

    // 3. La pantalla de login es visible: título, campo de correo y botón de envío
    //    (textos/roles reales de LoginScreen.tsx). Damos margen porque al arrancar
    //    AuthProvider resuelve la sesión persistida (spinner) antes de pintar.
    await expect(page.getByRole('heading', { name: 'Entra a LocationGuesser' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('textbox', { name: 'Tu correo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enviar enlace mágico' })).toBeVisible()

    // 4. Higiene: ningún error PROPIO de consola/JS/petición (terceros tolerados).
    expect(errors, `Errores inesperados al cargar el login:\n${errors.join('\n')}`).toEqual([])
  })
})
