import { test, expect } from '@playwright/test'

// Issue #992 — la tarjeta-imagen de compartir salía NEGRA en iOS/Safari: el bug
// de html-to-image en WebKit (upstream #361) hace que la PRIMERA pasada de
// rasterización omita las imágenes (background data-URL y SVG), dejando solo el
// texto sobre negro. El fix (nodeToPngBlob, shareLeaderboard.ts) rasteriza tres
// veces y se queda con la última.
//
// Este spec es la prueba EMPÍRICA en el motor real: abre el caso de la galería
// de `ChallengeShareCard` (fondo de marca, sin red), lo rasteriza EN el
// navegador con html-to-image igual que producción (3 pasadas), decodifica el
// PNG en un <canvas> y mide el brillo medio de la franja central. Antes del fix,
// en WebKit salía ~negro (brillo <10); con el fix debe verse la escena de marca.
// Corre en webkit Y en chromium (config: playwright.sharecard.config.ts).
//
// El umbral es deliberadamente holgado (>16): no medimos "bonito", medimos
// "no es un rectángulo negro".

const CASES = ['tarjeta-reto-sin-foto-ubicacion', 'tarjeta-reto-sin-foto-numero']

for (const caseId of CASES) {
  test(`la tarjeta rasterizada no sale negra — ${caseId}`, async ({ page }) => {
    await page.goto(`/gallery.html?case=${encodeURIComponent(caseId)}`)
    await expect(page.locator('#root')).not.toBeEmpty()
    // Deja asentar fuentes/estilos del caso antes de rasterizar.
    await page.waitForTimeout(500)

    const meanBrightness = await page.evaluate(async () => {
      // El nodo raíz de la tarjeta: el primer hijo renderizado del caso.
      const card = document.querySelector('#root [class*="card"]') as HTMLElement | null
      if (!card) throw new Error('No se encontró el nodo de la tarjeta en la galería')

      // MISMO camino que producción (nodeToPngBlob): html-to-image, 3 pasadas,
      // nos quedamos con la última — el workaround de WebKit que se prueba aquí.
      // `/@id/` = resolución de módulos del dev server de Vite: un import con
      // especificador pelado no resuelve dentro de `page.evaluate` (Vite solo
      // transforma los módulos que sirve él). Este spec siempre corre contra el
      // dev server de la galería (ver playwright.sharecard.config.ts).
      const mod = (await import(/* @vite-ignore */ '/@id/html-to-image')) as {
        toPng: (n: HTMLElement, o?: { pixelRatio?: number }) => Promise<string>
      }
      const { toPng } = mod
      let dataUrl = ''
      for (let i = 0; i < 3; i++) {
        dataUrl = await toPng(card, { pixelRatio: 1 })
      }

      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('No se pudo decodificar el PNG'))
        img.src = dataUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Sin contexto 2d')
      ctx.drawImage(img, 0, 0)

      // Franja central (evita el pie con scrim y la cabecera): del 20% al 60%
      // de alto, todo el ancho, muestreando 1 de cada 8 píxeles.
      const y0 = Math.floor(img.height * 0.2)
      const h = Math.floor(img.height * 0.4)
      const { data } = ctx.getImageData(0, y0, img.width, h)
      let sum = 0
      let n = 0
      for (let i = 0; i < data.length; i += 4 * 8) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3
        n++
      }
      return sum / n
    })

    // Un rectángulo negro puro da ~0-8; la escena de marca (esfera/obturador
    // sobre grafito-azul) supera el umbral con margen.
    expect(
      meanBrightness,
      `brillo medio ${meanBrightness.toFixed(1)} — la tarjeta se rasterizó negra`,
    ).toBeGreaterThan(16)
  })
}
