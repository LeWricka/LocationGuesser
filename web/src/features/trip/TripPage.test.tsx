import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

// El botón de compartir vive en la cabecera del viaje y abre el InviteModal de
// ESE viaje (#330). Mockeamos las piezas pesadas (datos, mapa, hojas) y el propio
// InviteModal por un stub ligero: así el test verifica SOLO la conexión botón→modal.
vi.mock('./useTripData', () => ({
  useTripData: () => ({
    group: { id: 'g1', name: 'Japón 2026', closed_at: null, prizes: null },
    moments: [],
    route: [],
    leaderboard: [],
    recentResults: [],
    recentTitle: null,
    winnersByChallenge: new Map(),
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}))

vi.mock('./TripDiario', () => ({ TripDiario: () => <div data-testid="diario" /> }))
vi.mock('./TripRetos', () => ({ TripRetos: () => <div data-testid="retos" /> }))
vi.mock('./TripWrap', () => ({ TripWrap: () => <div data-testid="wrap" /> }))
vi.mock('./MomentSheet', () => ({ MomentSheet: () => null }))
vi.mock('../group/EditChallenge', () => ({ EditChallenge: () => null }))

vi.mock('../../lib/membership', () => ({
  isMember: async () => true,
  myGroups: async () => [{ id: 'g1', isOwner: true }],
  getGroupMembers: async () => [{ name: 'Iker' }],
}))

vi.mock('../group/InviteModal', () => ({
  InviteModal: ({ open, link }: { open: boolean; link: string }) =>
    open ? <div data-testid="invite-modal">{link}</div> : null,
}))

import { TripPage } from './TripPage'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  refreshProfile: async () => {},
}

function renderTrip() {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <TripPage
          groupId="g1"
          onPlayChallenge={vi.fn()}
          onAddMoment={vi.fn()}
          onAddChallenge={vi.fn()}
          onOpenClassic={vi.fn()}
          onBack={vi.fn()}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

describe('TripPage — compartir visible (#330)', () => {
  beforeEach(() => {
    // matchMedia (useReducedMotion) no existe en jsdom por defecto.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  })

  test('el botón "Invitar al viaje" abre el InviteModal con el enlace /v/<code>', async () => {
    renderTrip()
    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /invitar al viaje/i }))
    const modal = await screen.findByTestId('invite-modal')
    expect(modal).toHaveTextContent('/v/g1')
  })
})
