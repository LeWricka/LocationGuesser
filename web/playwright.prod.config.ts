import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Config del SMOKE LOGUEADO POST-DEPLOY contra PRODUCCIÓN (#458). A diferencia del
// smoke hermético (mocks, sin secretos, corre en cada PR), este apunta a la app
// REAL en `https://www.tabide.app` con una CUENTA DE TEST, para cazar lo que solo
// se ve logueado + con Google Maps/BD de verdad (el punto ciego de esta semana).
//
// - NO levanta servidor: pega a la URL de prod tal cual.
// - Reutiliza el `global-setup` existente: si hay E2E_USER_EMAIL/PASSWORD +
//   VITE_SUPABASE_*, hace login por password y deja la sesión en storageState.
//   Sin esas credenciales, el spec se salta solo (guard `hasAuthCreds`).
// - Solo corre `prod-logged-smoke.spec.ts` (no arrastra la suite completa).

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Carga ligera de web/.env.local en process.env (sin dependencias): el global-setup
// necesita VITE_SUPABASE_* (+ E2E_USER_*) en el entorno de Node para autenticar. No
// pisamos lo ya definido en el shell (CI usa secrets vía env, no .env.local).
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

// Origen EFECTIVO de prod. `tabide.app` hace 308 → `www.tabide.app`, así que la app
// corre en `www`. La sesión en storageState es scope de ORIGEN: fijarla en el origen
// donde la SPA realmente carga evita que un redirect deje la navegación sin sesión.
// Override con E2E_BASE_URL (p.ej. un deploy de preview) si hiciera falta.
const baseURL = process.env.E2E_BASE_URL ?? 'https://www.tabide.app'

export default defineConfig({
  testDir: 'e2e',
  testMatch: /prod-logged-smoke\.spec\.ts/,
  // Reutiliza el global-setup: genera el storageState autenticado SOLO si hay
  // E2E_USER_*. Sin credenciales no hace nada y el spec se salta (guard en el spec).
  globalSetup: './e2e/global-setup.ts',
  // Contra prod NO paralelizamos: un solo test que toca la app real; menos ruido.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Un reintento: prod puede tener latencia puntual (tiles, Maps); no queremos falsos
  // rojos, pero sí cazar roturas reales (que fallan de forma consistente).
  retries: 1,
  reporter: 'list',
  use: {
    baseURL,
    // Artefactos al fallar para depurar contra prod sin ruido.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  // Viewport ALTO: la hoja inmersiva de crear (mapa + hoja que crece + footer) es
  // alta; con el alto por defecto (720) el CTA/Street View caen fuera del viewport.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
    },
  ],
  // Sin webServer: apuntamos directamente a prod.
})
