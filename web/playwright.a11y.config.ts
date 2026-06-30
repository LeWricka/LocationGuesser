import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para el GUARDARRAÍL de accesibilidad (issue #396). Aparte de
// playwright.config.ts (smoke E2E) y de playwright.gallery.config.ts (captura) porque:
// (1) NO usa global-setup ni credenciales (la galería va con fixtures, sin login ni
// red), (2) levanta el dev server con GALLERY=1 para servir gallery.html con los
// dobles, (3) es HERMÉTICO: el spec bloquea toda red externa (tiles/SDK/CDN), así que
// el chequeo es 100% determinista y offline.
//
// El viewport de cada comprobación lo fija el spec (axe a un viewport representativo;
// overflow horizontal a 320px), por eso aquí solo dejamos la base de Desktop Chrome.

const PORT = 5189
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /gallery-a11y\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  // Un único spec recorre todos los casos × comprobaciones; subimos el límite por
  // test para que quepan axe + overflow sobre ~18 casos.
  timeout: 180_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    isMobile: false,
  },
  projects: [{ name: 'a11y' }],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL + '/gallery.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GALLERY: '1' },
  },
})
