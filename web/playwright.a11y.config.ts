import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para los GUARDARRAÍLES visuales/a11y HERMÉTICOS de la galería.
// Aparte de playwright.config.ts (smoke E2E) y de playwright.gallery.config.ts (captura)
// porque: (1) NO usa global-setup ni credenciales (la galería va con fixtures, sin login
// ni red), (2) levanta el dev server con GALLERY=1 para servir gallery.html con los
// dobles, (3) es HERMÉTICO: cada spec bloquea toda red externa (tiles/SDK/CDN), así que
// el chequeo es 100% determinista y offline.
//
// Cubre tres specs (issue #396 accesibilidad + #415 integridad de esquina + #417 gesto):
//  - gallery-a11y: axe a viewport representativo + no-overflow horizontal a 320px.
//  - gallery-corner-integrity: la hoja (GlobeSheet) no deja asomar la escena oscura por
//    sus esquinas redondeadas (muestreo de píxel en los triángulos de esquina).
//  - gallery-sheet-scroll-expand: el gesto de scroll sobre la hoja dirige su expansión
//    (scroll arriba la agranda, scroll abajo la recoge) — cableado del nested scroll.
//
// El viewport de cada comprobación lo fija el propio spec, por eso aquí solo dejamos la
// base de Desktop Chrome.

const PORT = 5189
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /gallery-(a11y|corner-integrity|sheet-scroll-expand)\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  // Un único spec recorre todos los casos × comprobaciones; subimos el límite por
  // test para que quepan axe + overflow sobre ~18 casos (y margen: el runner de CI
  // va ~3× más lento que local y la galería crece con cada feature).
  timeout: 360_000,
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
