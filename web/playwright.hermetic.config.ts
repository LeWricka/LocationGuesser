import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Config del E2E HERMÉTICO del bucle de crear reto (#443). A diferencia de la config
// principal (dev server + StrictMode), este corre contra el BUILD de PRODUCCIÓN
// servido por `vite preview`. Motivo: en dev, React StrictMode re-ejecuta el efecto
// de auto-join y NORMALIZA el hash (descarta `&add=reto`) al entrar al flujo de crear
// desde el FAB — un artefacto SOLO de dev que no ocurre en prod. Contra el build,
// el flujo se comporta como para el usuario real.
//
// No necesita secretos ni BD: los specs mockean sesión + Supabase + Google Maps
// (ver e2e/helpers/hermetic.ts). Corre en local y en CI igual.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Carga ligera de web/.env.local en process.env (sin dependencias): `vite build`
// necesita las VITE_* para no romper en el arranque del cliente. Valores placeholder
// bastan (todo va mockeado). No pisamos lo ya definido en el shell (CI usa env).
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

// Placeholders para que `vite build`/`preview` arranquen aunque no haya .env.local
// (p.ej. en CI): la app se monta y todo el tráfico va mockeado por los specs.
process.env.VITE_SUPABASE_URL ??= 'https://placeholder.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_placeholder'
process.env.VITE_GOOGLE_MAPS_API_KEY ??= 'placeholder-maps-key'

const PORT = 4183

export default defineConfig({
  testDir: 'e2e',
  testMatch: /create-hermetic\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  // Viewport ALTO: la hoja inmersiva de crear (mapa + hoja que crece + footer) mide
  // ~860px; con el alto por defecto (720) el CTA cae fuera del viewport y no se puede
  // pulsar. Tabide es móvil-first pero el flujo necesita alto; damos 1000px.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
    },
  ],
  // Build de prod + preview: sin StrictMode, comportamiento como en producción.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
