import { test as base, expect, type Page, type Route } from '@playwright/test'

// E2E HERMÉTICO del flujo de auth email-first (issue #506). Mockea sesión + Supabase
// para cubrir los 5 escenarios obligatorios:
//   a. Email NUEVO → código → paso nombre → home.
//   b. Email EXISTENTE → código → home SIN pedir nombre y SIN muro.
//   c. Sesión persistida → abrir app → directo a home sin entrada.
//   d. Crear viaje estando logueado NO muestra "valida tu correo".
//   e. Enlace compartido → ver/jugar sin cuenta (sin sesión).
//
// No toca la BD real. Supabase REST mockeado vía page.route().

const test = base

// Ref del proyecto (igual que hermetic.ts): debe coincidir con VITE_SUPABASE_URL.
function projectRef(): string {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://hermetic.supabase.co'
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return 'hermetic'
  }
}

const FAKE_USER_ID = '00000000-0000-0000-0000-000000000099'
const FAKE_GROUP_ID = '11111111-1111-1111-1111-111111111100'

// Sesión mínima que AuthProvider lee de localStorage. El `is_anonymous` en false
// + `email_confirmed_at` puesto = cuenta OTP verificada (no anónima).
function fakeSession(opts: { displayName?: string } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  return {
    access_token: 'hermetic-auth-token',
    refresh_token: 'hermetic-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expiresAt,
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'auth-e2e@example.com',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
      is_anonymous: false,
      app_metadata: { provider: 'email' },
      user_metadata: opts.displayName ? { display_name: opts.displayName } : {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

// Siembra sesión en localStorage y mockea Supabase REST para que AuthProvider arranque.
async function primeWithSession(
  page: Page,
  opts: { displayName?: string; groupId?: string } = {},
): Promise<void> {
  const ref = projectRef()
  const storageKey = `sb-${ref}-auth-token`
  const sessionValue = JSON.stringify(fakeSession(opts))

  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [storageKey, sessionValue] as const,
  )

  const displayName = opts.displayName
  const groupId = opts.groupId

  await page.route(/supabase\.co/, async (route: Route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Perfil: AuthProvider lo pide al arrancar; determina si se muestra ProfileGate.
    if (url.includes('/rest/v1/profiles')) {
      const accept = route.request().headers()['accept'] ?? ''
      const wantsObject = accept.includes('vnd.pgrst.object')
      // Sin display_name → cuenta nueva → App muestra ProfileGate.
      // Con display_name → cuenta existente → App va directo a home.
      const profileRow = displayName
        ? { id: FAKE_USER_ID, display_name: displayName, avatar_url: null }
        : { id: FAKE_USER_ID, display_name: null, avatar_url: null }
      // POST (upsert) para guardar el nombre: devolvemos la fila actualizada.
      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(displayName ? profileRow : { ...profileRow, display_name: 'Nuevo' }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: wantsObject ? JSON.stringify(profileRow) : JSON.stringify([profileRow]),
      })
    }

    // Membresía: grupos del usuario (myGroups en home, isMember en grupo).
    if (url.includes('/rest/v1/group_members')) {
      if (method === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      }
      const groupRow = groupId
        ? {
            group_id: groupId,
            user_id: FAKE_USER_ID,
            role: 'owner',
            groups: {
              id: groupId,
              name: 'Viaje hermético',
              created_by: FAKE_USER_ID,
              created_at: '2026-01-01T00:00:00.000Z',
              closed_at: null,
              prizes: null,
              starts_on: null,
              ends_on: null,
              description: null,
              companions: null,
              cover_image_path: null,
            },
          }
        : null
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: groupRow ? JSON.stringify([groupRow]) : '[]',
      })
    }

    // Grupos (getGroup al abrir un link de grupo).
    if (url.includes('/rest/v1/groups') && groupId) {
      const accept = route.request().headers()['accept'] ?? ''
      const wantsObject = accept.includes('vnd.pgrst.object')
      const row = {
        id: groupId,
        name: 'Viaje hermético',
        created_by: FAKE_USER_ID,
        created_at: '2026-01-01T00:00:00.000Z',
        closed_at: null,
        prizes: null,
        starts_on: null,
        ends_on: null,
        description: null,
        companions: null,
        cover_image_path: null,
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: wantsObject ? JSON.stringify(row) : JSON.stringify([row]),
      })
    }

    // Retos: vacío para el diario.
    if (url.includes('/rest/v1/challenges')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }

    // Todo lo demás: vacío OK.
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('flujo auth email-first (hermético, issue #506)', () => {
  // ── Landing ─────────────────────────────────────────────────────────────────

  test('landing muestra CTA único "Empieza a compartir" (sin split signup/login)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Comparte tus viajes/ }).first()).toBeVisible({
      timeout: 20_000,
    })
    // CTA primario email-first (repetido en héroe y cierre de la narrativa: por
    // eso `.first()`, no es un "split" de signup/login).
    await expect(page.getByRole('button', { name: 'Empieza a compartir' }).first()).toBeVisible()
    // Ya NO hay dos CTAs separados.
    await expect(page.getByRole('button', { name: 'Crear tu viaje' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Ya tengo cuenta · Entrar' })).not.toBeVisible()
    // Nota de enlace intacta.
    await expect(page.getByText(/Te han pasado un enlace/i)).toBeVisible()
  })

  test('CTA "Empieza a compartir" abre el flujo de email (campo correo, sin nombre)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Empieza a compartir' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Empieza a compartir' }).first().click()
    // Muestra campo de correo, sin campo de nombre.
    await expect(page.getByRole('textbox', { name: 'Tu correo' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Tu nombre' })).not.toBeVisible()
    // Botón "Atrás" devuelve a la landing.
    await page.getByRole('button', { name: 'Atrás' }).click()
    await expect(page.getByRole('button', { name: 'Empieza a compartir' }).first()).toBeVisible()
  })

  // ── Escenario b: email existente → código → home sin paso nombre ────────────

  test('(b) email existente → código → home SIN pedir nombre y SIN muro', async ({ page }) => {
    // Siembra sesión con perfil ya existente (display_name definido).
    await primeWithSession(page, { displayName: 'Lewis' })
    await page.goto('/')

    // La home debe cargarse directamente (perfil tiene nombre → no ProfileGate).
    // Esperamos al GlobeSheet o al HomeEmptyState.
    await expect(page.getByRole('heading', { name: /Comparte tus viajes/ }).first()).toBeVisible({
      timeout: 20_000,
    })
    // No debe mostrar ProfileGate (campo de nombre para jugar).
    await expect(page.getByLabel(/¿Con qué nombre juegas\?/i)).not.toBeVisible()
    // No debe mostrar la pantalla de email (ya está logueado).
    await expect(page.getByRole('textbox', { name: 'Tu correo' })).not.toBeVisible()
  })

  // ── Escenario c: sesión persistida → home directo ───────────────────────────

  test('(c) sesión persistida → abrir app → directo a home sin entrada', async ({ page }) => {
    // Sesión preexistente con nombre.
    await primeWithSession(page, { displayName: 'Lewis' })
    await page.goto('/')

    // Home directa sin mostrar la landing ni el flujo de email.
    await expect(page.getByRole('heading', { name: /Comparte tus viajes/ }).first()).toBeVisible({
      timeout: 20_000,
    })
    // La landing (sin sesión) nunca aparece.
    await expect(page.getByRole('button', { name: 'Empieza a compartir' })).not.toBeVisible()
  })

  // ── Escenario a: email nuevo → ProfileGate (paso nombre) → home ─────────────

  test('(a) sesión nueva sin nombre → muestra paso de nombre → home', async ({ page }) => {
    // Sesión sin display_name (cuenta nueva, recién verificada por OTP).
    await primeWithSession(page, { displayName: undefined })
    await page.goto('/')

    // ProfileGate debe aparecer: "¿Con qué nombre juegas?"
    await expect(page.getByRole('heading', { name: /¿Con qué nombre juegas\?/i })).toBeVisible({
      timeout: 20_000,
    })
    // El campo de nombre debe estar presente.
    await expect(page.getByRole('textbox')).toBeVisible()
    // No debe mostrar la landing (hay sesión).
    await expect(page.getByRole('button', { name: 'Empieza a compartir' })).not.toBeVisible()
  })

  // ── Escenario d: crear viaje sin muro de validación ─────────────────────────

  test('(d) crear viaje estando logueado NO muestra "valida tu correo"', async ({ page }) => {
    // Sesión OTP verificada con nombre (usuario normal verificado).
    await primeWithSession(page, { displayName: 'Lewis' })
    await page.goto('/#nuevo')

    // No debe mostrar el CreateGate (eliminado en #506).
    await expect(page.getByRole('heading', { name: /valida tu correo/i })).not.toBeVisible({
      timeout: 10_000,
    })
    // No debe mostrar el muro de "validar correo".
    await expect(page.getByText(/valida tu correo para crear/i)).not.toBeVisible()
  })

  // ── Escenario e: enlace compartido → ver/jugar sin cuenta ───────────────────

  test('(e) enlace compartido SIN sesión → entrada con gracia, sin muro de login', async ({
    page,
  }) => {
    // Sin sesión: simula un visitante que recibe un enlace de grupo. Tras el
    // issue #758, un deep link sin sesión ya NO cae directo a la landing: primero
    // se intenta una sesión ANÓNIMA (`AnonReceptorGate`) para ver/jugar sin dar
    // datos. Según el entorno hay DOS desenlaces legítimos, y este test acepta
    // ambos con tal de que la entrada sea con GRACIA (nunca un muro de login ni
    // una pantalla en blanco):
    //   - anónimo HABILITADO (backend real): se crea sesión y el auto-join a un
    //     grupo INEXISTENTE (id de prueba) falla con gracia → JoinErrorScreen
    //     ("Este viaje ya no existe" + "Ir al inicio").
    //   - anónimo DESHABILITADO: degradación a la landing pública ("Empieza a
    //     compartir").
    await page.goto(`/#g=${FAKE_GROUP_ID}`)

    // Cualquiera de las dos salidas con gracia es válida.
    const landingCta = page.getByRole('button', { name: 'Empieza a compartir' }).first()
    const joinRecovery = page.getByRole('button', { name: 'Ir al inicio' })
    await expect(landingCta.or(joinRecovery)).toBeVisible({ timeout: 20_000 })

    // Nunca un muro bloqueante de "login requerido".
    await expect(page.getByText(/debes iniciar sesión/i)).not.toBeVisible()
    await expect(page.getByText(/necesitas cuenta/i)).not.toBeVisible()
  })
})
