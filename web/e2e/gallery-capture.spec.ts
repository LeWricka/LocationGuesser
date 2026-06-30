import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Route, expect, test } from '@playwright/test'

// Captura automática de la galería (issue #364, multiviewport #375): recorre CADA
// caso a VARIOS viewports representativos y guarda un PNG por caso×viewport en
// web/gallery-shots/ (gitignoreado). Así la máquina "ve" cada pantalla de forma
// determinista y a distintos altos, donde asoman las franjas muertas y el escalado
// que un único alto (390×844) no enseña.
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

// Viewports representativos. `compacto` es el de siempre (iPhone-ish 19.5:9).
// `alto` reproduce el móvil del dueño (1080×2400 ≈ ratio 2.2 a @3x): es donde
// aparecen las franjas muertas y el escalado. `ancho` cubre un Pro Max @3x.
interface Viewport {
  name: string
  width: number
  height: number
  deviceScaleFactor: number
}

const VIEWPORTS: Viewport[] = [
  { name: 'compacto', width: 390, height: 844, deviceScaleFactor: 2 },
  { name: 'alto', width: 390, height: 960, deviceScaleFactor: 3 },
  { name: 'ancho', width: 430, height: 932, deviceScaleFactor: 3 },
]

// Bloquea cualquier petición a un host que NO sea localhost: el contenido es 100%
// local (fixtures + data-URIs), así que cualquier red externa sería ruido no
// determinista (y dejaría la galería offline si fallara).
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

test('captura cada pantalla de la galería a varios viewports', async ({ browser, baseURL }) => {
  // Un contexto por viewport: deviceScaleFactor solo se fija al crear el contexto,
  // no se puede cambiar en una página viva, por eso abrimos uno nuevo por viewport.
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
    })
    await context.route('**/*', blockExternal)
    const page = await context.newPage()

    // Cargamos el índice para leer la lista de casos publicada por el entry.
    await page.goto('/gallery.html')
    const cases = await page.evaluate<GalleryCaseMeta[]>(() => window.__galleryCases ?? [])
    expect(cases.length, 'la galería debe publicar casos en window.__galleryCases').toBeGreaterThan(
      0,
    )

    for (const c of cases) {
      await page.goto(`/gallery.html?case=${encodeURIComponent(c.id)}`)
      // Esperamos a que el caso monte algo real (no la pantalla de "no encontrado") y
      // a que la red quede en reposo (imágenes data-URI ya resueltas).
      await page.waitForLoadState('networkidle')
      await expect(page.locator('#root')).not.toBeEmpty()
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${c.id}--${vp.name}.png`),
        fullPage: false,
      })
    }

    await context.close()
  }
})
