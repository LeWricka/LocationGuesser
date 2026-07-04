import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para el modo HÍBRIDO "galería + mapa real" (issue #695):
// SOLO sirve para regenerar los assets del showcase de la landing
// (`web/src/assets/landing/home.webp` y `viaje.webp`) con el satélite Esri de
// verdad en vez del stub plano oscuro de la galería normal. Aparte de
// playwright.gallery.config.ts (captura hermética de TODOS los casos) porque:
// (1) levanta el dev server con GALLERY=1 **y** GALLERY_REAL_MAP=1 (deja pasar el
// paquete real `maplibre-gl`, ver vite.config.ts), (2) NO es hermético: el propio
// spec permite red hacia los hosts de teselas de Esri (ver `landing-assets.spec.ts`)
// — por eso NO corre en CI (ningún workflow ni `npm run e2e` la invoca; solo el
// script dedicado de abajo).
//
// Regenerar los assets:
//   npm run landing:assets
//
// (requiere red de verdad hacia server.arcgisonline.com; en CI/sin red fallaría,
// por eso queda fuera de la suite automática — es una tarea manual/puntual, igual
// que `npm run gallery:shots`).

const PORT = 5191
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /landing-assets\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  // Descargar teselas reales + convertir a webp con cwebp puede tardar más que un
  // test normal.
  timeout: 120_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    isMobile: false,
  },
  projects: [{ name: 'landing-assets' }],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL + '/gallery.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GALLERY: '1', GALLERY_REAL_MAP: '1' },
  },
})
