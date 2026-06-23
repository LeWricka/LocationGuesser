import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, type Page } from '@playwright/test'

// Helpers de la suite AUTENTICADA (#140). El global-setup deja la sesión en
// e2e/.auth/user.json (storageState). Aquí: un fixture que carga ese estado y
// pre-marca los flags de onboarding (para que los tutoriales no tapen el flujo),
// y un guard para saltar los specs cuando no hay credenciales.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_STATE_PATH = path.join(__dirname, '..', '.auth', 'user.json')

// ¿Hay credenciales para los E2E autenticados? Si no, los specs se saltan.
export const hasAuthCreds = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD)

// Extrae el id del usuario logueado del storageState (lo escribió global-setup).
// Sirve para construir las claves de onboarding (`lg:onboarding:<ctx>:seen:<id>`).
function readUserIdFromState(): string | null {
  try {
    const raw = fs.readFileSync(AUTH_STATE_PATH, 'utf8')
    const state = JSON.parse(raw) as {
      origins?: { localStorage?: { name: string; value: string }[] }[]
    }
    for (const origin of state.origins ?? []) {
      for (const item of origin.localStorage ?? []) {
        if (!item.name.endsWith('-auth-token')) continue
        const session = JSON.parse(item.value) as { user?: { id?: string } }
        if (session.user?.id) return session.user.id
      }
    }
  } catch {
    // Sin estado válido (suite saltada): no hay id, no pasa nada.
  }
  return null
}

// Pre-marca los tutoriales de onboarding como vistos para este usuario, ANTES de
// que cargue la app, para que el overlay no se interponga en el flujo.
async function seedOnboardingFlags(page: Page, userId: string): Promise<void> {
  await page.addInitScript((id: string) => {
    window.localStorage.setItem(`lg:onboarding:group:seen:${id}`, '1')
    window.localStorage.setItem(`lg:onboarding:challenge:seen:${id}`, '1')
  }, userId)
}

// Fixture: usa el storageState de global-setup y, si conocemos el userId, pre-marca
// los flags de onboarding antes de cualquier navegación del test.
export const test = base.extend({
  storageState: AUTH_STATE_PATH,
  // El callback de fixture de Playwright se llama `use` por convención; lo
  // renombramos a `runTest` para no chocar con la regla react-hooks/rules-of-hooks
  // (que trata cualquier `use(...)` como el hook `use` de React).
  page: async ({ page }, runTest) => {
    const userId = readUserIdFromState()
    if (userId) await seedOnboardingFlags(page, userId)
    await runTest(page)
  },
})

export { expect } from '@playwright/test'
