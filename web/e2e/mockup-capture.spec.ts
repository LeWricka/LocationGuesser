import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Route, expect, test } from '@playwright/test'

// Captura de los mockups del camino feliz.
// Navega a /#mockups y recorre cada pantalla vía prev/next.
// Captura a DOS viewports: alto (1080×2400 prioritario) y compacto (390×844).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = path.join(__dirname, '..', 'mockup-shots')

interface Viewport {
  name: string
  width: number
  height: number
  deviceScaleFactor: number
}

// Alto = móvil del dueño (ratio 2.2). Compacto = iPhone-ish.
const VIEWPORTS: Viewport[] = [
  { name: 'alto', width: 390, height: 960, deviceScaleFactor: 3 },
  { name: 'compacto', width: 390, height: 844, deviceScaleFactor: 2 },
]

// IDs de las pantallas del mockup (correspondencia 1:1 con PANTALLAS en MockupIndex.tsx).
const MOCKUP_IDS = ['entrar', 'ver-viaje', 'crear-reto', 'jugar', 'marcador']

// Bloquea peticiones externas (misma estrategia que la galería).
const blockExternal = (route: Route) => {
  const url = route.request().url()
  if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  return route.abort()
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

test('captura mockups del camino feliz a alto y compacto', async ({ browser, baseURL }) => {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    await context.route('**/*', blockExternal)
    const page = await context.newPage()

    // Navegar a la app con #mockups para activar el visor.
    await page.goto('/#mockups')
    await page.waitForLoadState('networkidle')

    // Verificar que el MockupIndex cargó.
    await expect(page.locator('nav')).toBeVisible()

    // Índice en orden: cada pantalla navega en secuencia usando los botones del visor.
    // La pantalla inicial es la primera; prev/next navegan en orden.
    for (let i = 0; i < MOCKUP_IDS.length; i++) {
      const id = MOCKUP_IDS[i]

      // Avanzar a la pantalla i usando el botón → desde la pantalla anterior.
      // Excepto la primera (ya la estamos viendo).
      if (i > 0) {
        await page.locator('button[aria-label="Pantalla siguiente"]').click()
        await page.waitForTimeout(80) // deja animar
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `${id}--${vp.name}.png`),
        fullPage: false,
      })
    }

    await context.close()
  }
})
