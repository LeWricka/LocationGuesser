import { defineConfig, devices } from '@playwright/test'

// Config del spec de la tarjeta de compartir (issue #992): prueba EMPÍRICA de
// que la rasterización con html-to-image no sale negra en WEBKIT (el motor de
// iOS Safari, donde vive el bug upstream #361) además de en chromium. Config
// propia (como la galería/a11y) porque: (1) usa la galería con GALLERY=1 y sus
// dobles, sin red ni credenciales; (2) necesita el proyecto webkit, que el
// smoke E2E principal no instala. Si el runner no tiene webkit instalado
// (`npx playwright install webkit`), Playwright falla ese proyecto con un
// mensaje claro — en CI se instala junto a chromium en el workflow que lo corra.

const PORT = 5189
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /share-card-webkit\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  use: { baseURL },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL + '/gallery.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { GALLERY: '1' },
  },
})
