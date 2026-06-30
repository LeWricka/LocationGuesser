import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// Captura automática de la galería (issue #364): recorre CADA caso a viewport
// móvil (390×844 @2x, definido en playwright.gallery.config.ts) y guarda un PNG por
// caso en web/gallery-shots/ (gitignoreado). Así la máquina "ve" cada pantalla de
// forma determinista, sin que un humano navegue la app.
//
// Determinismo: el entry de la galería congela el reloj y apaga animaciones; aquí
// bloqueamos toda la red EXTERNA (tiles/SDK/CDN) para que ninguna petición fuera de
// localhost ensucie la captura. La lista de casos se lee de window.__galleryCases
// (no se hardcodea: añadir un caso en cases.tsx lo añade a la captura sola).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = path.join(__dirname, '..', 'gallery-shots')

interface GalleryCaseMeta {
  id: string
  title: string
  section: string
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

// Bloquea cualquier petición a un host que NO sea localhost: el contenido es 100%
// local (fixtures + data-URIs), así que cualquier red externa sería ruido no
// determinista (y dejaría la galería offline si fallara).
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    return route.abort()
  })
})

test('captura cada pantalla de la galería', async ({ page }) => {
  // Cargamos el índice para leer la lista de casos publicada por el entry.
  await page.goto('/gallery.html')
  const cases = await page.evaluate<GalleryCaseMeta[]>(() => window.__galleryCases ?? [])
  expect(cases.length, 'la galería debe publicar casos en window.__galleryCases').toBeGreaterThan(0)

  for (const c of cases) {
    await page.goto(`/gallery.html?case=${encodeURIComponent(c.id)}`)
    // Esperamos a que el caso monte algo real (no la pantalla de "no encontrado") y a
    // que la red quede en reposo (imágenes data-URI ya resueltas).
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#root')).not.toBeEmpty()
    await page.screenshot({ path: path.join(SHOTS_DIR, `${c.id}.png`), fullPage: false })
  }
})
