// Keep-alive del último viaje (issue #979, ola 4 de navegación): al RE-ENTRAR a un
// viaje (reto→atrás→viaje, home→viaje reciente) el TripPage NO debe remontarse —así el
// mapa/globo no se re-inicializa (sin flash de canvas)—; se mantiene MONTADO y OCULTO al
// navegar fuera y se re-MUESTRA al volver. Solo UN viaje vivo: entrar a un grupo distinto
// desmonta el anterior. Aquí ejercemos ESE cableado de App.tsx con un `TripPage` de doble
// que registra montaje/desmontaje y refleja su prop `active`, mockeando el resto de
// infraestructura (igual que App.test.tsx) para no arrastrar Supabase ni chunks pesados.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SessionState } from './lib/session-context'
import { ToastProvider } from './ui'

const user = {
  id: 'u-1',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
} as User

// Registro de ciclo de vida del `TripPage` de doble: qué grupos montaron/desmontaron y
// qué `active` recibió cada uno en su último render. La ESENCIA del keep-alive se lee de
// aquí (un solo montaje por grupo pese a navegar fuera y volver).
const tripMounts: string[] = []
const tripUnmounts: string[] = []

vi.mock('./features/trip/TripPage', () => ({
  TripPage: ({ groupId, active }: { groupId: string; active?: boolean }) => {
    useEffect(() => {
      tripMounts.push(groupId)
      return () => {
        tripUnmounts.push(groupId)
      }
    }, [groupId])
    return (
      <div data-testid={`trip-${groupId}`} data-active={active === false ? 'false' : 'true'}>
        trip {groupId}
      </div>
    )
  },
}))
vi.mock('./features/play/PlayChallenge', () => ({
  PlayChallenge: ({ challengeId, groupId }: { challengeId: string; groupId: string }) => (
    <div data-testid="play">
      play {groupId}/{challengeId}
    </div>
  ),
}))
vi.mock('./features/home/HomePage', () => ({
  HomePage: () => <div data-testid="home">home</div>,
}))
vi.mock('./lib/GoogleMapsProvider', () => ({
  GoogleMapsProvider: ({ children }: { children: ReactNode }) => children,
}))

// Infraestructura mockeada igual que en App.test.tsx (aislar el enrutado de App).
vi.mock('./lib/auth', () => ({
  signInAnonymously: vi.fn(async () => ({ error: null })),
  setNextDestination: vi.fn(),
  takeNextDestination: vi.fn(() => null),
}))
vi.mock('./lib/analytics', () => ({ track: vi.fn() }))
vi.mock('./lib/observability', () => ({ reportError: vi.fn() }))
vi.mock('./lib/groupData', () => ({ getGroup: vi.fn(async () => null) }))
vi.mock('./lib/useAnalyticsIdentity', () => ({ useAnalyticsIdentity: () => {} }))
vi.mock('./lib/admin', () => ({ isAdminEmail: () => false }))
vi.mock('./lib/session', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./lib/prefetch', () => ({ prefetchMainRoutes: () => () => {} }))

let sessionState: SessionState
vi.mock('./lib/session-context', () => ({
  useSession: () => sessionState,
}))

vi.mock('./features/auth', () => ({
  Landing: () => <div data-testid="landing">landing</div>,
  LoginFlow: () => null,
  ProfileGate: () => null,
  useDeepLinkJoin: () => ({ joinIfGroup: vi.fn(async () => {}), error: null, clearError: vi.fn() }),
  needsProfileStep: () => false,
  AccountUpgradeModal: () => null,
}))
vi.mock('./features/onboarding', () => ({
  ReceptorWelcomeGate: ({ children }: { children: ReactNode }) => children,
}))

import App from './App'

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
    user,
    profile: { id: 'u-1', display_name: 'Lewis' } as SessionState['profile'],
    loading: false,
    verified: true,
    isAnonymous: false,
    refreshProfile: vi.fn(),
    ...overrides,
  }
}

// Navega cambiando el hash SIN provocar el auto-`hashchange` de jsdom (replaceState no lo
// emite) y disparando UNO propio, determinista, con el `oldURL`/`newURL` que App lee.
function navigate(hash: string) {
  const oldURL = window.location.href
  window.history.replaceState(null, '', hash === '' ? '/' : hash)
  const newURL = window.location.href
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL }))
  })
}

beforeEach(() => {
  tripMounts.length = 0
  tripUnmounts.length = 0
  window.history.replaceState(null, '', '/')
  sessionState = baseSession()
})

describe('App — keep-alive del último viaje (#979)', () => {
  test('reto→atrás→viaje: el viaje NO se remonta y reaparece activo', async () => {
    window.history.replaceState(null, '', '#g=A')
    renderApp()

    // El viaje A monta VISIBLE (active).
    const tripA = await screen.findByTestId('trip-A')
    expect(tripA.dataset.active).toBe('true')
    expect(tripMounts).toEqual(['A'])

    // → reto de A: el viaje sigue MONTADO (mismo instante) pero oculto e inactivo.
    navigate('#g=A&c=c1')
    await screen.findByTestId('play')
    const hiddenTrip = screen.getByTestId('trip-A')
    expect(hiddenTrip).toBeInTheDocument()
    expect(hiddenTrip.dataset.active).toBe('false')
    // El wrapper de keep-alive lo oculta (display:none + inert + aria-hidden).
    const wrapper = hiddenTrip.parentElement as HTMLElement
    expect(wrapper).toHaveAttribute('hidden')
    expect(wrapper).toHaveAttribute('inert')
    // Sin remontaje ni desmontaje: el globo no se re-inicializa.
    expect(tripMounts).toEqual(['A'])
    expect(tripUnmounts).toEqual([])

    // ← atrás al viaje: vuelve a estar activo, SIEMPRE el mismo instante (nunca remontó).
    navigate('#g=A')
    await waitFor(() => expect(screen.getByTestId('trip-A').dataset.active).toBe('true'))
    expect(screen.queryByTestId('play')).not.toBeInTheDocument()
    expect(tripMounts).toEqual(['A'])
    expect(tripUnmounts).toEqual([])
  })

  test('home→viaje reciente: el viaje queda vivo (oculto) y reaparece sin remontar', async () => {
    window.history.replaceState(null, '', '#g=A')
    renderApp()
    await screen.findByTestId('trip-A')

    // → home: el viaje A queda MONTADO pero oculto/inactivo (no se desmonta).
    navigate('')
    await screen.findByTestId('home')
    expect(screen.getByTestId('trip-A').dataset.active).toBe('false')
    expect(tripMounts).toEqual(['A'])
    expect(tripUnmounts).toEqual([])

    // ← al viaje reciente: reaparece activo, mismo instante.
    navigate('#g=A')
    await waitFor(() => expect(screen.getByTestId('trip-A').dataset.active).toBe('true'))
    expect(tripMounts).toEqual(['A'])
  })

  test('cambiar de grupo desmonta el viaje anterior (solo UN viaje vivo)', async () => {
    window.history.replaceState(null, '', '#g=A')
    renderApp()
    await screen.findByTestId('trip-A')

    // → viaje B: A se DESMONTA (limpia su globo) y B monta; nunca dos viajes vivos.
    navigate('#g=B')
    await screen.findByTestId('trip-B')
    expect(screen.queryByTestId('trip-A')).not.toBeInTheDocument()
    expect(tripUnmounts).toEqual(['A'])
    expect(tripMounts).toEqual(['A', 'B'])
    expect(screen.getByTestId('trip-B').dataset.active).toBe('true')
  })
})
