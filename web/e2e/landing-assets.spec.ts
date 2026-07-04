import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Route, expect, test } from '@playwright/test'

// Regenera los assets del showcase de la landing (issue #695) con el satélite Esri
// REAL en vez del stub plano oscuro de la galería hermética: el dueño reportó que
// `home.webp`/`viaje.webp` (marcos de móvil de la landing) enseñaban el mapa
// estilizado del stub, no el producto de verdad. Corre contra la galería en modo
// híbrido `GALLERY=1 GALLERY_REAL_MAP=1` (ver vite.config.ts): mantiene fixtures/
// fakeSupabase/sesión falsa y el determinismo de la galería (reloj congelado,
// animaciones apagadas), pero deja pasar el paquete REAL `maplibre-gl`, así que
// los pines-foto de `showcaseFixtures.ts` quedan clavados sobre teselas reales.
//
// A diferencia de `gallery-capture.spec.ts` (100% hermético, bloquea TODA red
// externa) este spec permite explícitamente la red hacia el host de teselas de
// Esri (ESRI_HOST_PATTERN abajo, el único que usa el preset `diario` — satélite +
// etiquetas, ver `src/lib/mapPresets.ts`) y bloquea cualquier otro host externo
// (analítica, etc.) para no depender de servicios que no necesitamos.
//
// NO corre en CI ni con `npm run e2e`: tiene su PROPIO comando y config
// (igual que `gallery-capture`/`npm run gallery:shots`), y necesita red de verdad
// (no determinista, no apto para CI). Regenerar los assets:
//
//   cd web && npm run landing:assets
//
// Requiere `cwebp` instalado (https://developers.google.com/speed/webp/docs/cwebp;
// en macOS: `brew install webp`).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets', 'landing')

// Único host de teselas del preset `diario` (satélite + etiquetas Esri, ver
// mapPresets.ts): ambas capas de HomeGlobe/TripMapGlobe piden a este mismo host,
// solo cambia la ruta (World_Imagery vs. Reference/World_Boundaries_and_Places).
const ESRI_HOST_PATTERN = /^https:\/\/server\.arcgisonline\.com\//

// Tamaño máximo del webp final (requisito del dueño: ≤150KB por captura de la
// landing, coherente con el resto de assets/landing/*.webp).
const MAX_WEBP_BYTES = 150 * 1024
// Escalón de calidad de `cwebp -q`: empezamos en 75 (pedido del dueño) y bajamos de
// 5 en 5 si hace falta hasta caber en el límite, sin pasar de un mínimo razonable.
const WEBP_QUALITY_START = 75
const WEBP_QUALITY_MIN = 40
const WEBP_QUALITY_STEP = 5

// Viewport de las capturas del showcase: mismo tamaño que usan hoy los assets de
// `src/assets/landing/*.webp` (390×844, @2x — ver LandingShowcase/landingShowcaseData).
const VIEWPORT = { width: 390, height: 844 }
const DEVICE_SCALE_FACTOR = 2

// Cuánto tiempo sin una respuesta NUEVA de tesela Esri consideramos "el mapa dejó
// de cargar" (proxy de `idle`: HomeGlobe no tiene skeleton/evento propio expuesto
// para acechar desde fuera — solo TripMapGlobe lo tiene internamente, vía
// `map.once('idle', …)` — así que usamos la MISMA señal, red en reposo, para los
// dos casos y mantenemos el spec simple). Margen final tras la quietud de red: el
// navegador necesita un frame más para componer/pintar la última tesela decodificada.
const TILE_QUIET_MS = 700
const TILE_WAIT_TIMEOUT_MS = 20_000
const PAINT_MARGIN_MS = 500
// Al montar, HomeGlobe/TripMapGlobe hacen `fitBounds`/`flyTo` a los pines (encuadre
// final): esos vuelos duran ≤800ms en el propio código (`FLY_TO_ACTIVE_DURATION_MS`,
// `duration: 800` en TripMapGlobe). El PRIMER lote de teselas (vista mundo inicial,
// antes de encuadrar) puede quedar "en reposo" antes de que el vuelo termine y pida
// el SEGUNDO lote (zoom/centro final) — sin este respiro capturaríamos el globo A
// MEDIO GIRO. Esperamos a que el vuelo acabe ANTES de empezar a medir quietud de red.
const CAMERA_SETTLE_MS = 1200

interface ShowcaseCase {
  /** Id del caso de la galería (`window.__galleryCases`, ver cases.tsx). */
  caseId: string
  /** Fichero final en `src/assets/landing/` (mismo nombre que hoy). */
  fileName: string
}

// Únicos dos assets con mapa real (issue #695): `jugar.webp`/`resultado.webp` no
// llevan satélite (el mapa de "jugar" es CARTO Voyager, reducido a un mini-mapa
// decorativo de esquina, no protagonista) ni el wordmark viejo, así que no hace
// falta regenerarlos aquí.
const CASES: ShowcaseCase[] = [
  { caseId: 'showcase-home', fileName: 'home.webp' },
  { caseId: 'showcase-viaje', fileName: 'viaje.webp' },
]

/** Deja pasar localhost/data/blob (la app + fixtures) y el host de teselas Esri;
 * bloquea cualquier otra red externa (analítica, etc.) — no la necesitamos y así
 * la captura no depende de servicios ajenos al mapa. */
const allowEsriAndLocal = (route: Route) => {
  const url = route.request().url()
  if (
    url.startsWith('http://localhost') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    ESRI_HOST_PATTERN.test(url)
  ) {
    return route.continue()
  }
  return route.abort()
}

/** Convierte un PNG a webp con `cwebp`, bajando la calidad hasta caber en
 * `MAX_WEBP_BYTES` (o hasta el mínimo). Devuelve la calidad y el peso final. */
function convertToWebp(pngPath: string, webpPath: string): { quality: number; bytes: number } {
  let quality = WEBP_QUALITY_START
  for (;;) {
    execFileSync('cwebp', ['-q', String(quality), pngPath, '-o', webpPath], { stdio: 'pipe' })
    const bytes = fs.statSync(webpPath).size
    if (bytes <= MAX_WEBP_BYTES || quality <= WEBP_QUALITY_MIN) return { quality, bytes }
    quality -= WEBP_QUALITY_STEP
  }
}

test('regenera home.webp/viaje.webp con satélite Esri real', async ({ browser, baseURL }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-landing-assets-'))

  for (const { caseId, fileName } of CASES) {
    const context = await browser.newContext({
      baseURL,
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    })

    // Cuenta respuestas de teselas Esri para aproximar "el mapa dejó de cargar"
    // (ver TILE_QUIET_MS arriba): sin esto no hay forma de distinguir "todavía
    // pidiendo teselas" de "ya está, solo faltan otras peticiones sueltas".
    let tileCount = 0
    let lastTileAt = 0
    context.on('response', (response) => {
      if (ESRI_HOST_PATTERN.test(response.url())) {
        tileCount += 1
        lastTileAt = Date.now()
      }
    })
    await context.route('**/*', allowEsriAndLocal)

    const page = await context.newPage()
    await page.goto(`/gallery.html?case=${encodeURIComponent(caseId)}`)
    await expect(page.locator('#root')).not.toBeEmpty()

    // Revela el crédito de Esri (issue #695): el mapa NO usa el control nativo de
    // atribución de MapLibre (banda que rompía el diseño, #363/#382); en su lugar
    // pinta su propio botón "ⓘ" plegado (HomeGlobe/TripMapGlobe, aria-label
    // "Créditos del mapa") que despliega el texto al tocarlo. Requisito de
    // licencia de Esri: el crédito debe quedar VISIBLE en la captura, así que lo
    // desplegamos ANTES de disparar el screenshot.
    //
    // Dos motivos para hacerlo con `page.evaluate` (click de DOM directo) en vez de
    // un locator normal: (1) todo el globo/mapa vive bajo un `aria-hidden="true"`
    // (decorativo — el estado real se comunica por otros medios accesibles), así
    // que NO aparece en el árbol de accesibilidad y `getByRole` no lo encuentra;
    // (2) el botón queda geométricamente bajo el dock de tarjetas/carrusel (mismo
    // stacking context, sin z-index propio), así que un click "real" de Playwright
    // (incluso con `force: true`) golpea ese dock, no el botón. `.click()` de DOM
    // dispara el evento nativo que React escucha, sin pasar por el hit-testing del
    // navegador.
    await page.waitForSelector('[aria-label="Créditos del mapa"]', { state: 'attached' })
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Créditos del mapa"]')?.click()
    })
    // El click dispara un `setState` de React: espera a que el re-render lo refleje
    // en el DOM (no es instantáneo, por eso no lo leemos en el mismo `evaluate`).
    await expect(page.locator('[aria-label="Créditos del mapa"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    // Deja que el vuelo de cámara del encuadre (fitBounds/flyTo a los pines) TERMINE
    // antes de medir quietud de red (ver CAMERA_SETTLE_MS): si no, el primer lote de
    // teselas (vista mundo inicial) puede quedar "en reposo" antes de que el vuelo
    // pida el lote final, y capturaríamos el globo a medio girar.
    await page.waitForTimeout(CAMERA_SETTLE_MS)

    // Espera a que las teselas Esri dejen de llegar (proxy de "mapa cargado de
    // verdad"; ver TILE_QUIET_MS) + un margen fijo para que el navegador termine de
    // componer/pintar la última tesela decodificada.
    const deadline = Date.now() + TILE_WAIT_TIMEOUT_MS
    expect(
      tileCount,
      `[${caseId}] no llegó ninguna tesela de ${ESRI_HOST_PATTERN}`,
    ).toBeGreaterThan(0)
    while (Date.now() - lastTileAt < TILE_QUIET_MS && Date.now() < deadline) {
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(PAINT_MARGIN_MS)

    const pngPath = path.join(tmpDir, `${caseId}.png`)
    await page.screenshot({ path: pngPath })
    await context.close()

    const webpPath = path.join(ASSETS_DIR, fileName)
    const { quality, bytes } = convertToWebp(pngPath, webpPath)
    console.log(
      `[landing:assets] ${fileName}: ${tileCount} teselas, calidad cwebp ${quality}, ` +
        `${(bytes / 1024).toFixed(1)}KB`,
    )
    expect(
      bytes,
      `${fileName} supera ${MAX_WEBP_BYTES / 1024}KB incluso a calidad mínima`,
    ).toBeLessThanOrEqual(MAX_WEBP_BYTES)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })
})
