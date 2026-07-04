import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

// Smoke HERMÉTICO (#140): no depende de auth ni escribe en BD. La app ahora exige
// login (magic link), así que el smoke se queda en la puerta: comprueba que la SPA
// monta y que la landing con sus CTAs de alta/login es visible (#495).
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
  test('la SPA monta y muestra la landing con CTAs de alta/login, sin errores propios', async ({
    page,
  }) => {
    const errors = trackErrors(page)

    // 1. Carga la raíz: cualquier ruta sin sesión cae a la landing pública.
    await page.goto('/')

    // 2. La SPA montó: #root tiene contenido (no quedó en blanco).
    const root = page.locator('#root')
    await expect(root).not.toBeEmpty()

    // 3. La landing pública es visible: hero del producto y CTAs de alta/login (#495).
    //    El correo ya NO está a la vista: aparece al pulsar un CTA (pantalla completa).
    //    Damos margen porque al arrancar AuthProvider resuelve la sesión persistida.
    // La frase ancla aparece dos veces (hero h1 + sección "cómo funciona"); basta
    // con que el hero sea visible, así que tomamos el primero.
    await expect(page.getByRole('heading', { name: /Comparte tus momentos/ }).first()).toBeVisible({
      timeout: 20_000,
    })
    // CTA ÚNICO email-first (#506): "Empieza a compartir". Ya no hay separación
    // alta/login ("Crear tu viaje" / "Ya tengo cuenta") ni "Tengo un código" (los
    // viajes van por enlace). Puede haber más de un CTA con ese nombre (hero +
    // showcase), así que tomamos el primero.
    const startBtn = page.getByRole('button', { name: 'Empieza a compartir', exact: true }).first()
    await expect(startBtn).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear tu viaje', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Ya tengo cuenta/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Tengo un código/i })).toHaveCount(0)

    // El CTA abre el login email-first (LoginScreen): SOLO correo, un único flujo para
    // nuevo y recurrente. Sin campo de nombre (si la cuenta es nueva, el nombre se
    // pide DESPUÉS del código, no aquí).
    await startBtn.click()
    await expect(page.getByRole('heading', { name: 'Entra a Momentu' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Tu correo' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Tu nombre' })).toHaveCount(0)

    // 5. Higiene: ningún error PROPIO de consola/JS/petición (terceros tolerados).
    expect(errors, `Errores inesperados al cargar la landing:\n${errors.join('\n')}`).toEqual([])
  })
})
