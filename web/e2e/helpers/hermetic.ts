import { test as base, type Page, type Route } from '@playwright/test'

// Harness HERMÉTICO para el bucle de crear reto (#443). No depende de credenciales,
// no toca la BD ni la Maps JS API real: mockea la sesión de Supabase (localStorage),
// el SDK de Google Maps (google.maps.importLibrary) y las llamadas REST/Storage que
// hace el flujo de crear. Así un rompimiento del bucle de crear lo caza el CI SIN
// secretos, y podemos simular tanto el camino feliz como un Street View que falla.
//
// Por qué no reusar la suite autenticada (create-full): esa escribe en la BD real y
// se salta sin E2E_USER_*. Este harness corre SIEMPRE (local y CI) y es determinista.

// Ref del proyecto que usa el cliente para la clave de localStorage `sb-<ref>-auth-token`.
// No apunta a nada real: solo debe COINCIDIR con el ref de VITE_SUPABASE_URL para que
// el AuthProvider lea la sesión que sembramos. Lo derivamos de la env (fallback fijo).
function projectRef(): string {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://hermetic.supabase.co'
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return 'hermetic'
  }
}

const FAKE_USER_ID = '00000000-0000-0000-0000-0000000000e2'
export const HERMETIC_GROUP_ID = '11111111-1111-1111-1111-111111111111'

// Sesión de Supabase mínima pero con la forma que espera `@supabase/supabase-js`:
// un access_token JWT-shaped, expiración lejana y el user con id. AuthProvider la
// lee de localStorage y arranca ya logueado (sin flujo de magic link ni red de auth).
function fakeSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  return {
    access_token: 'hermetic-access-token',
    refresh_token: 'hermetic-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expiresAt,
    user: {
      id: FAKE_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e-hermetic@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

// SDK de Google Maps mockeado en runtime. `svAvailable=false` simula que la Maps JS
// API se niega en el navegador (clave restringida por dominio): getPanorama RECHAZA,
// como en prod. El flujo debe degradar a "sin Street View" y dejar crear igual.
function installGoogleMapsMock(page: Page, svAvailable: boolean) {
  return page.addInitScript((available: boolean) => {
    const StreetViewService = class {
      getPanorama() {
        if (!available) return Promise.reject(new Error('ZERO_RESULTS'))
        return Promise.resolve({
          data: {
            location: {
              pano: 'HERMETIC_PANO',
              latLng: { lat: () => 40.4, lng: () => -3.7 },
            },
          },
        })
      }
    }
    const StreetViewPreference = { NEAREST: 'nearest', BEST: 'best' }
    // Panorama interactivo: StreetViewPreview lo monta cuando el creador ACEPTA el
    // Street View (sin foto, el SV es la escena y se muestra la previa). El mock es
    // inerte pero con la forma que consume el componente (addListener → remove, getPov)
    // para que la previa monte sin lanzar y el flujo no reviente (#453).
    const StreetViewPanorama = class {
      addListener() {
        return { remove() {} }
      }
      getPov() {
        return { heading: 0, pitch: 0 }
      }
      setPov() {}
      setPano() {}
    }
    const maps: Record<string, unknown> = {
      StreetViewService,
      StreetViewPreference,
      StreetViewPanorama,
      // El flujo de crear construye estos en runtime para los marcadores del mapa.
      Size: class {},
      Point: class {},
      Marker: class {},
      Map: class {},
      LatLngBounds: class {
        extend() {
          return this
        }
        getCenter() {
          return { lat: () => 0, lng: () => 0 }
        }
        isEmpty() {
          return false
        }
      },
      Animation: { DROP: 1, BOUNCE: 2 },
      // <APIProvider> lee Settings.getInstance() al marcar el SDK como cargado
      // (control de App Check / experience ids). Devolvemos un singleton inerte.
      Settings: { getInstance: () => ({ experienceIds: [], fetchAppCheckToken: null }) },
      // Definir `importLibrary` ANTES de montar <APIProvider> hace que su bootstrap
      // no inyecte el script real (usa este). Devolvemos por nombre lo que cada
      // consumidor lee: 'streetView' → el servicio; 'core'/'maps' → un objeto vacío
      // (el mapa de crear es Leaflet, no Google Maps, así que no se usa nada de ahí).
      importLibrary: (name: string) => {
        if (name === 'streetView')
          return Promise.resolve({ StreetViewService, StreetViewPreference, StreetViewPanorama })
        return Promise.resolve({})
      },
    }
    ;(window as unknown as { google: { maps: typeof maps } }).google = { maps }
  }, svAvailable)
}

// El grupo hermético que "existe" en la BD mockeada: el usuario de test es su
// CREADOR/DUEÑO, así que la pantalla Viaje muestra el FAB "＋" para crear reto.
const GROUP_ROW = {
  id: HERMETIC_GROUP_ID,
  name: 'Viaje hermético',
  prizes: null,
  closed_at: null,
  starts_on: null,
  ends_on: null,
  description: null,
  companions: null,
  cover_image_path: null,
  created_by: FAKE_USER_ID,
  created_at: '2026-06-01T00:00:00.000Z',
}

// Responde según el Accept: PostgREST con `.single()`/`.maybeSingle()` pide
// `application/vnd.pgrst.object+json` y espera un OBJETO; el resto, un ARRAY.
function respond(route: Route, status: number, rows: unknown[], singleRow?: unknown) {
  const accept = route.request().headers()['accept'] ?? ''
  const wantsObject = accept.includes('vnd.pgrst.object')
  const body = wantsObject ? JSON.stringify(singleRow ?? rows[0] ?? null) : JSON.stringify(rows)
  return route.fulfill({ status, contentType: 'application/json', body })
}

// Intercepta las llamadas de Supabase que hace el flujo (Viaje + crear reto) y
// responde local, por endpoint. Así la pantalla Viaje carga con el FAB (el usuario
// es dueño) y el INSERT del reto devuelve la fila creada. El SDK de Google Maps NO
// se carga por red (lo cubre installGoogleMapsMock); bloqueamos su bootstrap igual.
async function mockSupabase(page: Page) {
  const supaHost = /supabase\.co/

  // Bloquea la Maps JS API real: el mock de runtime ya provee `google.maps`.
  await page.route(/maps\.googleapis\.com|maps\.gstatic\.com/, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  )

  await page.route(supaHost, async (route: Route) => {
    const url = route.request().url()
    const method = route.request().method()

    // Perfil: AuthProvider lo pide al arrancar; sin él se queda en loading.
    if (url.includes('/rest/v1/profiles')) {
      return respond(route, 200, [
        { id: FAKE_USER_ID, display_name: 'E2E Hermético', avatar_key: null, avatar_url: null },
      ])
    }

    // Grupo: la pantalla Viaje lo pide (getGroup, maybeSingle) → existe.
    if (url.includes('/rest/v1/groups')) {
      return respond(route, 200, [GROUP_ROW])
    }

    // Membresía: isMember, getGroupMembers y myGroups leen group_members. Devolvemos
    // al usuario como 'owner' del grupo (con el grupo anidado para myGroups) → el FAB
    // de crear aparece (canCreate = isOwner).
    if (url.includes('/rest/v1/group_members')) {
      if (method === 'POST') return respond(route, 201, []) // auto-join idempotente
      return respond(route, 200, [
        { group_id: HERMETIC_GROUP_ID, user_id: FAKE_USER_ID, role: 'owner', groups: GROUP_ROW },
      ])
    }

    // Retos del grupo: aún ninguno (diario vacío). Vale para lista y myGroups.
    if (url.includes('/rest/v1/challenges') && method !== 'POST') {
      return respond(route, 200, [])
    }

    // Votos / respuestas: ninguno todavía.
    if (url.includes('/rest/v1/votes') || url.includes('/rest/v1/challenge_answers')) {
      return respond(route, 200, [])
    }

    // Subida de la foto a Storage: aceptamos sin guardar nada.
    if (url.includes('/storage/v1/object/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: 'images/hermetic.jpg' }),
      })
    }

    // INSERT del reto: devolvemos la fila creada (RETURNING sin lat/lng). Es la
    // pieza CLAVE: si esto responde 201, el flujo celebra y navega al deep link.
    if (url.includes('/rest/v1/challenges') && method === 'POST') {
      const row = {
        id: 'hermetic-challenge-1',
        group_id: HERMETIC_GROUP_ID,
        title: '¿Dónde desayuné hoy?',
        description: null,
        is_challenge: true,
        place_lat: null,
        place_lng: null,
        image_path: 'images/hermetic.jpg',
        sv_pano_id: null,
        sv_heading: null,
        sv_pitch: null,
        sv_lock_move: false,
        sv_lock_rotate: false,
        guess_seconds: 30,
        deadline_at: '2999-12-31T23:59:59.999Z',
        photo_is_hint: true,
        score_scale: 'mundo',
        challenge_kind: 'location',
        number_question: null,
        number_unit: null,
        number_decimals: 0,
        number_tolerance: 'normal',
        created_by: FAKE_USER_ID,
        created_at: '2026-06-28T10:00:00.000Z',
      }
      return respond(route, 201, [row], row)
    }

    // Cualquier otra REST (RPC incidental, realtime handshake): vacío OK.
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

interface HermeticOptions {
  /** ¿La Maps JS API responde (true) o se niega/rechaza como en prod (false)? */
  streetViewAvailable: boolean
}

/**
 * Prepara la página para el flujo de crear reto de forma hermética: siembra la
 * sesión + los flags de onboarding en localStorage ANTES de cargar la app, mockea
 * el SDK de Google Maps y enruta Supabase a respuestas locales. Deja la página lista
 * para `goto('/#g=…&add=reto')`.
 */
export async function primeHermeticCreate(page: Page, opts: HermeticOptions): Promise<void> {
  const ref = projectRef()
  const storageKey = `sb-${ref}-auth-token`
  const sessionValue = JSON.stringify(fakeSession())

  // Sesión + onboarding en localStorage antes de cualquier script de la página.
  await page.addInitScript(
    ([key, value, userId]) => {
      window.localStorage.setItem(key, value)
      // Marca los tutoriales como vistos para que no tapen el flujo de crear.
      window.localStorage.setItem(`lg:onboarding:group:seen:${userId}`, '1')
      window.localStorage.setItem(`lg:onboarding:challenge:seen:${userId}`, '1')
      window.localStorage.setItem(`lg:onboarding:create-challenge:seen:${userId}`, '1')
    },
    [storageKey, sessionValue, FAKE_USER_ID] as const,
  )

  await installGoogleMapsMock(page, opts.streetViewAvailable)
  await mockSupabase(page)
}

// Fixture: expone `primeHermeticCreate` sin ceremonia extra. Reexporta expect.
export const test = base
export { expect } from '@playwright/test'
