import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para la CAPTURA de la galería (issue #364). Aparte de
// playwright.config.ts (smoke E2E) porque: (1) NO usa global-setup ni credenciales
// (la galería va con fixtures, sin login ni red), (2) levanta el dev server con
// GALLERY=1 para servir gallery.html con los dobles, (3) bloquea cualquier red
// externa (tiles/SDK/CDN) para que las capturas sean 100% deterministas y offline.
//
// El viewport/escala NO se fijan aquí: el spec abre un contexto propio por cada
// viewport representativo (ver VIEWPORTS en gallery-capture.spec.ts) para cazar las
// franjas muertas y el escalado que solo asoman en móviles altos (ratio ~2.2, tipo
// 1080×2400). Por eso aquí solo dejamos la base de Desktop Chrome.

const PORT = 5188
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /gallery-capture\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  // Un único test recorre todos los casos × todos los viewports, así que el límite
  // por test de 30s se queda corto: lo subimos para que quepan las ~3× capturas.
  timeout: 180_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    isMobile: false,
  },
  projects: [{ name: 'gallery' }],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL + '/gallery.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GALLERY: '1' },
  },
})
