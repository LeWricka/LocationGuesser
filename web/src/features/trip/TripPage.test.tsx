import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

// Invitar al viaje vive ahora en el menú ⋯ de la cabecera (oleada 1: una vista por
// viaje, cabecera única). El test verifica SOLO la conexión ⋯ → "Invitar" → modal.
// Mockeamos las piezas pesadas (datos, mapa, hojas, marcador incrustado) y el propio
// InviteModal por un stub ligero.
vi.mock('./useTripData', () => ({
  useTripData: () => ({
    group: { id: 'g1', name: 'Japón 2026', closed_at: null, prizes: null },
    moments: [],
    route: [],
    leaderboard: [],
    recentResults: [],
    recentTitle: null,
    winnersByChallenge: new Map(),
    pastChallenges: [],
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}))

vi.mock('./TripDiario', () => ({ TripDiario: () => <div data-testid="diario" /> }))
vi.mock('./TripWrap', () => ({ TripWrap: () => <div data-testid="wrap" /> }))
vi.mock('./MomentSheet', () => ({ MomentSheet: () => null }))
vi.mock('../group/EditChallenge', () => ({ EditChallenge: () => null }))
vi.mock('../group/GroupSettingsModal', () => ({ GroupSettingsModal: () => null }))

vi.mock('../../lib/membership', () => ({
  isMember: async () => true,
  myGroups: async () => [{ id: 'g1', isOwner: true }],
  getGroupMembers: async () => [{ name: 'Iker' }],
}))

vi.mock('../group/InviteModal', () => ({
  InviteModal: ({ open, link }: { open: boolean; link: string }) =>
    open ? <div data-testid="invite-modal">{link}</div> : null,
}))

// La gestión de miembros (#616) se prueba en MembersModal.test.tsx; aquí solo
// la conexión menú ⋯ → "Miembros" → modal.
vi.mock('../group/MembersModal', () => ({
  MembersModal: ({ groupId }: { groupId: string }) => (
    <div data-testid="members-modal">{groupId}</div>
  ),
}))

import { TripPage } from './TripPage'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
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
          onBack={vi.fn()}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

describe('TripPage — invitar desde el menú ⋯', () => {
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

  test('⋯ → "Invitar" abre el InviteModal con el enlace /v/<code>', async () => {
    renderTrip()
    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument()
    // Abrir el menú ⋯ de la cabecera y, dentro, pulsar "Invitar".
    await userEvent.click(screen.getByRole('button', { name: /más opciones del viaje/i }))
    await userEvent.click(screen.getByRole('button', { name: /^invitar$/i }))
    const modal = await screen.findByTestId('invite-modal')
    expect(modal).toHaveTextContent('/v/g1')
  })

  test('⋯ → "Miembros" abre el modal de gestión de miembros (#616)', async () => {
    renderTrip()
    expect(screen.queryByTestId('members-modal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /más opciones del viaje/i }))
    await userEvent.click(screen.getByRole('button', { name: /^miembros$/i }))
    const modal = await screen.findByTestId('members-modal')
    expect(modal).toHaveTextContent('g1')
  })
})
