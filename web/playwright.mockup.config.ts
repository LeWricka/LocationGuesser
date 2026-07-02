import { defineConfig, devices } from '@playwright/test'

// Config de Playwright para la captura de los MOCKUPS del camino feliz.
// Levanta el dev server normal (no el entry de galería) y navega a /#mockups.

const PORT = 5199
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: /mockup-capture\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    isMobile: false,
  },
  projects: [{ name: 'mockups' }],
  webServer: {
    command: 'npm run dev -- --port ' + PORT,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
