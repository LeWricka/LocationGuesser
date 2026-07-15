// Receptor sin cuenta (issue #758): un deep link de viaje/reto SIN sesión ya no
// cae directo a la Landing — `AppRoutes` intenta ANTES una sesión anónima
// (`signInAnonymously`, lib/auth.ts) y, mientras se resuelve, pinta el esqueleto
// de la ruta de destino. Si falla, degrada con gracia a la Landing de siempre.
//
// Aislamos `AppRoutes` del resto del árbol (AuthProvider real, features
// completas) mockeando `lib/session-context`/`lib/session` y el barril
// `features/auth`: así el test solo ejerce la lógica de enrutado de App.tsx,
// sin arrastrar Supabase real ni los chunks lazy de crear/jugar (fuera de
// alcance aquí).

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SessionState } from './lib/session-context'
import { ToastProvider } from './ui'

const anonUser = {
  id: 'u-anon',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: true,
} as User

const signInAnonymouslyMock = vi.fn<() => Promise<{ error: Error | null }>>()
const trackMock = vi.fn()
const reportErrorMock = vi.fn()

vi.mock('./lib/auth', () => ({
  signInAnonymously: () => signInAnonymouslyMock(),
  setNextDestination: vi.fn(),
  takeNextDestination: vi.fn(() => null),
}))
vi.mock('./lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))
vi.mock('./lib/observability', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}))
vi.mock('./lib/groupData', () => ({ getGroup: vi.fn(async () => null) }))
vi.mock('./lib/useAnalyticsIdentity', () => ({ useAnalyticsIdentity: () => {} }))
vi.mock('./lib/admin', () => ({ isAdminEmail: () => false }))
vi.mock('./lib/session', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

// Estado de sesión controlado a mano por cada test (sin AuthProvider real: no
// hay Supabase que resolver). `loading:false` y `user:null` por defecto — el
// escenario que interesa aquí es "sin sesión, deep link".
let sessionState: SessionState
vi.mock('./lib/session-context', () => ({
  useSession: () => sessionState,
}))

vi.mock('./features/auth', () => ({
  Landing: ({ groupName }: { groupName?: string }) => (
    <div data-testid="landing">landing{groupName ? `:${groupName}` : ''}</div>
  ),
  ProfileGate: () => null,
  useDeepLinkJoin: () => vi.fn(),
  needsProfileStep: () => false,
  AccountUpgradeModal: () => null,
}))
vi.mock('./features/onboarding', () => ({
  ReceptorWelcomeGate: ({ children }: { children: ReactNode }) => children,
}))

import App from './App'

// `AnonCreateGate` (App.tsx) usa `useToast`, que exige un `<ToastProvider>`
// ancestro — el mismo que `main.tsx` pone por encima de `<App/>` en producción.
function renderApp() {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  )
}

function baseSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session: null,
    user: null,
    profile: null,
    loading: false,
    verified: false,
    isAnonymous: false,
    refreshProfile: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  signInAnonymouslyMock.mockReset()
  trackMock.mockClear()
  reportErrorMock.mockClear()
  window.location.hash = ''
  sessionState = baseSession()
})

describe('AppRoutes — receptor sin cuenta en deep link (issue #758)', () => {
  test('deep link de viaje SIN sesión: intenta signInAnonymously y muestra el esqueleto mientras resuelve', async () => {
    window.location.hash = '#g=ABC'
    let resolveSignIn: (v: { error: Error | null }) => void = () => {}
    signInAnonymouslyMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )

    renderApp()

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1)
    // Esqueleto de ruta (RouteSkeletons.tsx: role="status", mismo aria-label en
    // TripRouteSkeleton/PlayRouteSkeleton), no la Landing.
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument()

    resolveSignIn({ error: null })
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('receptor_anon_signin', {
        outcome: 'success',
        kind: 'trip',
        group_id: 'ABC',
      }),
    )
    // Sin cambiar `user` (aquí no hay AuthProvider real que lo actualice), el
    // gate se queda en el esqueleto: no navega él mismo, espera a que
    // AuthProvider repinte con sesión (lo prueba session.test.tsx).
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
  })

  test('deep link de reto SIN sesión: usa el esqueleto de "jugar" (kind=challenge)', async () => {
    window.location.hash = '#g=ABC&c=uuid-reto'
    signInAnonymouslyMock.mockResolvedValue({ error: null })

    renderApp()

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
    // group_id/challenge_id (issue #751): sin ellos no se puede cruzar este
    // intento con el resto del funnel de ese mismo reto.
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('receptor_anon_signin', {
        outcome: 'success',
        kind: 'challenge',
        group_id: 'ABC',
        challenge_id: 'uuid-reto',
      }),
    )
  })

  test('si signInAnonymously falla (p.ej. toggle apagado), degrada a la Landing sin crash', async () => {
    window.location.hash = '#g=ABC'
    const err = new Error('Anonymous sign-ins are disabled')
    signInAnonymouslyMock.mockResolvedValue({ error: err })

    renderApp()

    await screen.findByTestId('landing')
    expect(reportErrorMock).toHaveBeenCalledWith(err, { area: 'receptor_anon_signin' })
    expect(trackMock).toHaveBeenCalledWith('receptor_anon_signin', {
      outcome: 'failed',
      kind: 'trip',
      group_id: 'ABC',
    })
  })

  test('home a secas (sin deep link) y sin sesión: Landing directa, sin intentar sign-in anónimo', () => {
    window.location.hash = ''
    renderApp()

    expect(signInAnonymouslyMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('landing')).toBeInTheDocument()
  })
})

// Migración 0032 (`groups_insert_owner`) exige `is_anonymous=false` en servidor
// para crear un viaje; en la UI, en vez de dejar que un anónimo choque con el
// error crudo de RLS al final del formulario, `#nuevo` lo intercepta ANTES con
// el mismo CTA "guárdate" que se ofrece tras jugar (issue #758).
describe('AppRoutes — crear viaje exige cuenta permanente (issue #758)', () => {
  test('receptor ANÓNIMO en #nuevo ve el CTA "guárdate" en vez del formulario de crear', async () => {
    window.location.hash = '#nuevo'
    sessionState = baseSession({ user: anonUser, isAnonymous: true })

    renderApp()

    expect(await screen.findByText('Guarda tu cuenta para crear un viaje')).toBeInTheDocument()
    // No monta el formulario de verdad (CreateGroup, con sus propios campos).
    expect(screen.queryByLabelText(/nombre del viaje/i)).not.toBeInTheDocument()
  })
})
