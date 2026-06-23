import { chromium, type FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Global setup de la suite AUTENTICADA (#140). Si hay credenciales de test
// (E2E_USER_EMAIL/E2E_USER_PASSWORD) genera un storageState con la sesión de
// Supabase ya puesta en localStorage; si NO las hay, no genera nada y la suite
// autenticada se salta (guard `test.skip` en sus specs).
//
// Por qué este enfoque: la app persiste la sesión en localStorage bajo la clave
// `sb-<ref>-auth-token`. Autenticamos por password con el cliente de Supabase en
// Node (signInWithPassword), abrimos un contexto de Playwright, fijamos esa clave
// en el origin (baseURL) y volcamos `context.storageState`. Así los specs
// arrancan ya logueados sin tocar el flujo de magic link (que requiere email).

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ruta del storageState. Compartida con playwright.config.ts (AUTH_STATE_PATH).
export const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json')

async function globalSetup(config: FullConfig) {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD

  // Sin credenciales: no generamos estado. La suite autenticada se saltará sola
  // (cada spec lleva un `test.skip(!E2E_USER_EMAIL, …)`). Limpiamos un estado
  // viejo para no arrastrar una sesión caducada de una corrida anterior.
  if (!email || !password) {
    if (fs.existsSync(AUTH_STATE_PATH)) fs.rmSync(AUTH_STATE_PATH)
    return
  }

  const url = (process.env.VITE_SUPABASE_URL ?? '').trim()
  const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  if (!url || !publishableKey) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY para autenticar los E2E. ' +
        'Cárgalos en el entorno (web/.env.local) antes de correr la suite autenticada.',
    )
  }

  // 1. Login por password en Node → obtenemos la sesión.
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(
      `No se pudo autenticar el usuario de test (${email}): ${error?.message ?? 'sin sesión'}. ` +
        'Crea el usuario con `npm run e2e:seed-user` y revisa E2E_USER_EMAIL/PASSWORD.',
    )
  }

  // 2. La clave de localStorage que usa el cliente del front: `sb-<ref>-auth-token`.
  //    El ref se extrae del subdominio de la URL del proyecto.
  const ref = new URL(url).hostname.split('.')[0]
  const storageKey = `sb-${ref}-auth-token`
  const sessionValue = JSON.stringify(data.session)

  // 3. Fijamos esa clave en el origin de la app y volcamos el storageState.
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173'
  const browser = await chromium.launch()
  const context = await browser.newContext()
  // addInitScript corre antes de cualquier script de la página: la sesión ya está
  // en localStorage cuando AuthProvider arranca, así no hay flash de login.
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [storageKey, sessionValue],
  )
  const page = await context.newPage()
  // Visitar el origin para que el localStorage quede asociado a él en el estado.
  await page.goto(baseURL)
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, storageKey)

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })
  await context.storageState({ path: AUTH_STATE_PATH })

  await browser.close()
}

export default globalSetup
