import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para la CAPTURA de la galería (issue #364). Aparte de
// playwright.config.ts (smoke E2E) porque: (1) NO usa global-setup ni credenciales
// (la galería va con fixtures, sin login ni red), (2) levanta el dev server con
// GALLERY=1 para servir gallery.html con los dobles, (3) bloquea cualquier red
// externa (tiles/SDK/CDN) para que las capturas sean 100% deterministas y offline.

const PORT = 5188
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /gallery-capture\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  // Viewport móvil con densidad 2x (lo que pide el encargo): iPhone-ish.
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ...devices['Desktop Chrome'],
    // Re-afirmamos viewport/escala tras el spread de devices (que trae los suyos).
    isMobile: false,
  },
  projects: [
    {
      name: 'gallery',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL + '/gallery.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GALLERY: '1' },
  },
})
