import { type ConsoleMessage, type Page, type Request } from '@playwright/test'
import { test, expect, hasAuthCreds } from './helpers/authed'

// SMOKE LOGUEADO POST-DEPLOY contra PRODUCCIÓN (#458).
//
// Corre con `npm run e2e:prod-logged` (config: playwright.prod.config.ts) contra la
// app REAL en `https://www.momentu.art` con una CUENTA DE TEST. Reutiliza el mecanismo
// de login por password del global-setup (storageState con la sesión de Supabase ya
// puesta en localStorage → arranca logueado, sin magic link).
//
// Por qué existe: los E2E de CI son HERMÉTICOS (mockean sesión, Supabase y Google
// Maps). Cazan regresiones de lógica, pero por diseño NO ven los bugs que solo
// aparecen logueado + con Google Maps/BD reales — el punto ciego de esta semana (el
// bloque "Añadir Street View" que no se veía en local). Este smoke recorre ese bucle
// en su entorno real.
//
// Qué verifica:
//   1. Home logueada monta: el globo + la sección "Tus viajes", sin errores propios.
//   2. Abrir un viaje (TripPage) monta: diario/marcador.
//   3. Crear reto → soltar pin en el mapa → "Añadir Street View" VISIBLE (con Google
//      Maps de verdad, dominio real).
//
// NO DESTRUCTIVO: aborta ANTES de persistir. No sube foto, no pone nombre, no lanza
// el reto → NO escribe ningún reto en la BD. Lo único que puede escribir es el
// auto-join al abrir el viaje de test (idempotente: el usuario de test ya es miembro
// de su viaje dedicado). No crea viajes: usa un viaje de test ya existente.
//
// Se SALTA LIMPIO si no hay credenciales (E2E_USER_EMAIL/PASSWORD): así el pipeline
// no se rompe hasta que el dueño configure la cuenta de test y los secrets.

test.skip(
  !hasAuthCreds,
  'Define E2E_USER_EMAIL/E2E_USER_PASSWORD (secrets) para el smoke logueado en prod',
)

// Ruido tolerado: terceros (mapas, Street View, analítica) y la propia red de
// Supabase (auth/realtime) pueden emitir avisos sin que la app esté rota. Solo nos
// importan los errores PROPIOS de la app.
const THIRD_PARTY = [
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'nominatim.openstreetmap.org',
  'tile.openstreetmap.org',
  'maps.googleapis.com',
  'maps.gstatic.com',
  'streetviewpixels',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'mxpnl.com',
  'mixpanel.com',
  'supabase.co',
  'sentry.io',
  'ingest.sentry.io',
  'Google Maps JavaScript API',
]

function isThirdPartyNoise(text: string): boolean {
  if (THIRD_PARTY.some((host) => text.includes(host))) return true
  return /Failed to load resource.*status of \d{3}/.test(text)
}

function trackErrors(page: Page): string[] {
  const errors: string[] = []

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isThirdPartyNoise(text)) return
    errors.push(`console.error: ${text}`)
  })

  page.on('pageerror', (err: Error) => {
    errors.push(`pageerror: ${err.message}`)
  })

  page.on('requestfailed', (req: Request) => {
    const url = req.url()
    if (isThirdPartyNoise(url)) return
    errors.push(`requestfailed: ${url} (${req.failure()?.errorText ?? 'unknown'})`)
  })

  return errors
}

// Viaje de test dedicado. El dueño lo pre-crea una vez y pone su id en el secret
// E2E_TRIP_ID (ver docs/operativa.md). Si no está, caemos a la primera tarjeta de
// "Tus viajes"; y si el usuario de test aún no tiene ninguno, saltamos las partes
// que necesitan un viaje (la home logueada sí se verifica igual).
const TRIP_ID = process.env.E2E_TRIP_ID?.trim()

test.describe('smoke logueado en prod (post-deploy)', () => {
  test('home logueada → viaje → crear reto → pin → "Añadir Street View" visible', async ({
    page,
  }) => {
    const errors = trackErrors(page)

    // ── 1. HOME LOGUEADA ──────────────────────────────────────────────────────
    // Con sesión, la raíz monta el dashboard: patrón globo + hoja "Tus viajes".
    await page.goto('/')

    // La SPA montó (no quedó en blanco tras resolver la sesión persistida).
    await expect(page.locator('#root')).not.toBeEmpty()

    // La sección "Tus viajes" del dashboard logueado es visible (confirma que NO
    // caímos al login: la landing pública no la tiene).
    await expect(page.getByRole('heading', { name: 'Tus viajes' })).toBeVisible({
      timeout: 30_000,
    })

    // El globo satélite de la home montó (canvas de MapLibre). Es tolerante a fallo
    // en la app, así que no lo exigimos duro: basta que la home no reviente.
    // (La verificación dura del render del mapa vive en el paso de crear reto.)

    // ── 2. ABRIR UN VIAJE (TripPage) ──────────────────────────────────────────
    // Preferimos el viaje de test dedicado (deep link). Si no hay id configurado,
    // abrimos la primera tarjeta de "Tus viajes". Si el usuario de test no tiene
    // ninguno, saltamos el resto (pero la home logueada ya quedó verificada).
    let openedTrip = false
    if (TRIP_ID) {
      await page.goto(`/#g=${TRIP_ID}`)
      openedTrip = true
    } else {
      const firstCard = page.getByRole('button', { name: /^Abrir viaje / }).first()
      if (await firstCard.isVisible().catch(() => false)) {
        await firstCard.click()
        openedTrip = true
      }
    }

    test.skip(
      !openedTrip,
      'El usuario de test no tiene ningún viaje. Configura E2E_TRIP_ID con un viaje de test dedicado.',
    )

    // TripPage montó: el FAB "＋" (único punto de crear) es la señal fiable de que la
    // pantalla del viaje cargó (diario/marcador). El auto-join del deep link es
    // idempotente para el viaje de test (el usuario ya es miembro).
    const fab = page.getByRole('button', { name: 'Crear momento o reto' })
    await expect(fab).toBeVisible({ timeout: 30_000 })

    // ── 3. CREAR RETO → PIN → "AÑADIR STREET VIEW" VISIBLE ─────────────────────
    // Abrimos el flujo inmersivo por el FAB → "Reto" (menuitem), igual que el usuario.
    await fab.click()
    await page.getByRole('menuitem', { name: 'Reto' }).click()

    // Selector de tipo → ¿Dónde? (reto de lugar, flujo de mapa).
    await page.getByRole('button', { name: /Crear reto ¿Dónde\?/ }).click()

    // Paso lugar: el mapa satélite a sangre con el hint "toca el mapa".
    await expect(page.getByText('marca dónde estás')).toBeVisible({ timeout: 30_000 })
    const map = page.locator('.leaflet-container')
    await expect(map).toBeVisible()

    // Soltar el pin: al tocar el mapa cae el punto y aparece el bloque de Street View.
    await map.click({ position: { x: 180, y: 200 } })

    // EL PUNTO CLAVE: con Google Maps REAL y el dominio de prod, el bloque
    // "Añadir Street View" debe estar VISIBLE junto al punto (el bug de esta semana).
    await expect(page.getByRole('button', { name: 'Añadir Street View' })).toBeVisible({
      timeout: 20_000,
    })

    // NO seguimos: no subimos foto, no nombramos, no lanzamos → no persiste ningún
    // reto. Abortamos aquí a propósito (smoke lo menos destructivo posible).

    // ── 4. HIGIENE ────────────────────────────────────────────────────────────
    // Ningún error PROPIO de consola/JS/petición (terceros tolerados).
    expect(errors, `Errores inesperados durante el smoke logueado:\n${errors.join('\n')}`).toEqual(
      [],
    )
  })
})
