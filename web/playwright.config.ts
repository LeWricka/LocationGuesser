import { defineConfig, devices } from '@playwright/test'

// Smoke tests E2E (issue #44): un navegador real contra la app para cazar lo
// que los unit tests no ven (errores de consola, peticiones fallidas, z-index,
// flujos rotos). Solo Chromium headless; un proyecto, ejecución rápida.

// Sin E2E_BASE_URL corremos en local contra el dev server; con ella (CI/prod)
// apuntamos a la URL dada y NO levantamos servidor.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const isLocal = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    // Artefactos solo cuando algo falla, para depurar sin ruido.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // En local arrancamos Vite; contra prod no tocamos ningún servidor.
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
})
