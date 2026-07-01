import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Smoke tests E2E (issue #44, adaptados a login en #140): un navegador real contra
// la app para cazar lo que los unit tests no ven (errores de consola, peticiones
// fallidas, z-index, flujos rotos). Solo Chromium headless; ejecución rápida.

// Carga ligera de web/.env.local en process.env (sin dependencias): el global-setup
// y los specs autenticados necesitan VITE_SUPABASE_* (y opcional E2E_USER_*) en el
// entorno de Node. Vite no las inyecta aquí. No pisamos lo ya definido en el shell
// (CI usa secrets vía env, no .env.local).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
function loadDotEnvLocal() {
  const file = path.join(__dirname, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    let value = trimmed.slice(eq + 1).trim()
    // Quitar comillas envolventes si las hubiera.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
loadDotEnvLocal()

// Sin E2E_BASE_URL corremos en local contra el dev server; con ella (CI/prod)
// apuntamos a la URL dada y NO levantamos servidor.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const isLocal = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  // El E2E hermético de crear reto corre con su PROPIA config (build de prod +
  // preview, sin StrictMode): ver playwright.hermetic.config.ts y `npm run e2e:create`.
  testIgnore: /create-hermetic\.spec\.ts/,
  // global-setup genera el storageState autenticado SOLO si hay E2E_USER_*. Sin
  // credenciales no hace nada y la suite autenticada se salta (guard en sus specs).
  globalSetup: './e2e/global-setup.ts',
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
