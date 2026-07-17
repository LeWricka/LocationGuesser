import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { Moment } from '../../lib/trip'

// Mockeamos las piezas pesadas (datos, mapa, hojas, marcador incrustado) y los
// modales de compartir por stubs ligeros. `useTripData` es un mock CONTROLABLE
// (vi.fn) para poder variar moments/leaderboard por test — la hoja "Compartir"
// nueva (issue #758) decide qué items ofrece según esos datos.
vi.mock('./useTripData', () => ({ useTripData: vi.fn() }))

vi.mock('./TripDiario', () => ({ TripDiario: () => <div data-testid="diario" /> }))
vi.mock('./TripWrap', () => ({ TripWrap: () => <div data-testid="wrap" /> }))
vi.mock('./MomentSheet', () => ({
  MomentSheet: ({ moment }: { moment: Moment | null }) =>
    moment ? <div data-testid="moment-sheet">{moment.challengeId}</div> : null,
}))
vi.mock('./ChallengeDetail', () => ({
  ChallengeDetail: ({ challengeId }: { challengeId: string }) => (
    <div data-testid="challenge-detail">{challengeId}</div>
  ),
}))
vi.mock('../group/EditChallenge', () => ({ EditChallenge: () => null }))
vi.mock('../group/GroupSettingsModal', () => ({ GroupSettingsModal: () => null }))

vi.mock('../../lib/membership', () => ({
  isMember: async () => true,
  myGroups: async () => [{ id: 'g1', isOwner: true }],
  getGroupMembers: async () => [{ name: 'Iker' }],
}))

vi.mock('../group/InviteModal', () => ({
  InviteModal: ({ open, link, origin }: { open: boolean; link: string; origin?: string }) =>
    open ? <div data-testid="invite-modal">{`${link}|${origin ?? ''}`}</div> : null,
}))

vi.mock('./ShareChallengeModal', () => ({
  ShareChallengeModal: ({ challengeId, origin }: { challengeId: string; origin?: string }) => (
    <div data-testid="share-challenge-modal">{`${challengeId}|${origin ?? ''}`}</div>
  ),
}))

vi.mock('../group/ShareLeaderboardModal', () => ({
  ShareLeaderboardModal: ({ open, origin }: { open: boolean; origin?: string }) =>
    open ? <div data-testid="share-leaderboard-modal">{origin ?? ''}</div> : null,
}))

// La gestión de miembros (#616) se prueba en MembersModal.test.tsx; aquí solo
// la conexión menú ⋯ → "Miembros" → modal.
vi.mock('../group/MembersModal', () => ({
  MembersModal: ({ groupId }: { groupId: string }) => (
    <div data-testid="members-modal">{groupId}</div>
  ),
}))

import { TripPage } from './TripPage'
import { useTripData } from './useTripData'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  isAnonymous: false,
  refreshProfile: async () => {},
}

function activeChallenge(overrides: Partial<Moment>): Moment {
  return {
    challengeId: 'c1',
    title: 'Reto activo',
    description: null,
    status: 'active',
    isChallenge: true,
    date: '2026-07-01T10:00:00.000Z',
    deadlineAt: '2026-07-02T10:00:00.000Z',
    imageUrl: null,
    imagePath: null,
    lat: null,
    lng: null,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: null,
    photoIsHint: true,
    ...overrides,
  }
}

function mockTripData(overrides: Partial<ReturnType<typeof useTripData>> = {}) {
  vi.mocked(useTripData).mockReturnValue({
    group: { id: 'g1', name: 'Japón 2026', closed_at: null, prizes: null },
    moments: [],
    route: [],
    leaderboard: [],
    winnersByChallenge: new Map(),
    pastChallenges: [],
    loading: false,
    error: null,
    refresh: async () => {},
    ...overrides,
  } as ReturnType<typeof useTripData>)
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

describe('TripPage — menú ⋯', () => {
  test('⋯ → "Miembros" abre el modal de gestión de miembros (#616)', async () => {
    mockTripData()
    renderTrip()
    expect(screen.queryByTestId('members-modal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /más opciones del viaje/i }))
    await userEvent.click(screen.getByRole('button', { name: /^miembros$/i }))
    const modal = await screen.findByTestId('members-modal')
    expect(modal).toHaveTextContent('g1')
  })

  test('⋯ ya NO ofrece "Invitar" (issue #758: se mudó a la hoja "Compartir")', async () => {
    mockTripData()
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /más opciones del viaje/i }))
    expect(screen.queryByRole('button', { name: /^invitar$/i })).not.toBeInTheDocument()
  })
})

// FAB "Compartir" (issue #758): abajo-izquierda, visible para cualquier miembro,
// abre la hoja con Invitar al viaje / Compartir un reto / Compartir clasificación.
describe('TripPage — FAB "Compartir" (#758)', () => {
  test('sin retos en juego ni clasificación: solo ofrece "Invitar al viaje"', async () => {
    mockTripData()
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /^compartir$/i }))
    expect(screen.getByRole('button', { name: /invitar al viaje/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /compartir un reto/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /compartir clasificación/i }),
    ).not.toBeInTheDocument()
  })

  test('"Invitar al viaje" abre el InviteModal con origin "share_fab"', async () => {
    mockTripData()
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /^compartir$/i }))
    await userEvent.click(screen.getByRole('button', { name: /invitar al viaje/i }))
    const modal = await screen.findByTestId('invite-modal')
    expect(modal).toHaveTextContent('/v/g1|share_fab')
  })

  test('con UN reto en juego: "Compartir un reto" abre ShareChallengeModal directo', async () => {
    mockTripData({ moments: [activeChallenge({ challengeId: 'c1' })] })
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /^compartir$/i }))
    await userEvent.click(screen.getByRole('button', { name: /compartir un reto/i }))
    const modal = await screen.findByTestId('share-challenge-modal')
    expect(modal).toHaveTextContent('c1|share_fab')
  })

  test('con VARIOS retos en juego: "Compartir un reto" abre un selector con miniaturas', async () => {
    mockTripData({
      moments: [
        activeChallenge({ challengeId: 'c1', title: 'El bosque de bambú' }),
        activeChallenge({ challengeId: 'c2', title: 'El Pabellón Dorado' }),
      ],
    })
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /^compartir$/i }))
    await userEvent.click(screen.getByRole('button', { name: /compartir un reto/i }))

    expect(screen.getByText('Elige un reto')).toBeInTheDocument()
    expect(screen.queryByTestId('share-challenge-modal')).not.toBeInTheDocument()
    const opcion = screen.getByRole('button', { name: /El Pabellón Dorado/ })
    await userEvent.click(opcion)
    const modal = await screen.findByTestId('share-challenge-modal')
    expect(modal).toHaveTextContent('c2|share_fab')
  })

  test('con clasificación: "Compartir clasificación" abre ShareLeaderboardModal', async () => {
    mockTripData({
      leaderboard: [{ userId: 'u1', name: 'Ana', avatar: null, points: 10, plays: 1 }],
    })
    renderTrip()
    await userEvent.click(screen.getByRole('button', { name: /^compartir$/i }))
    await userEvent.click(screen.getByRole('button', { name: /compartir clasificación/i }))
    const modal = await screen.findByTestId('share-leaderboard-modal')
    expect(modal).toHaveTextContent('share_fab')
  })
})

describe('TripPage — la sección se refleja en la URL', () => {
  test('cambiar a Marcador escribe v=marcador en el hash y volver a Diario lo quita (refrescar conserva la pestaña)', async () => {
    window.location.hash = '#g=g1'
    mockTripData()
    renderTrip()

    await userEvent.click(screen.getByRole('radio', { name: 'Marcador' }))
    expect(window.location.hash).toBe('#g=g1&v=marcador')

    await userEvent.click(screen.getByRole('radio', { name: 'Diario' }))
    expect(window.location.hash).toBe('#g=g1')
  })

  test('no pisa parámetros ajenos del hash (flujos vivos como add=recuerdo)', async () => {
    window.location.hash = '#g=g1&add=recuerdo'
    mockTripData()
    renderTrip()

    await userEvent.click(screen.getByRole('radio', { name: 'Marcador' }))
    expect(window.location.hash).toBe('#g=g1&add=recuerdo&v=marcador')
  })
})

describe('TripPage — restaura ver=/m= de la URL al montar (F5 no cierra lo abierto)', () => {
  type Past = ReturnType<typeof useTripData>['pastChallenges']

  test('con ver=<reto cerrado> reabre el detalle del reto', async () => {
    window.location.hash = '#g=g1&ver=c9'
    mockTripData({
      pastChallenges: [{ challengeId: 'c9', status: 'closed', myResult: null }] as Past,
    })
    renderTrip()
    expect(await screen.findByTestId('challenge-detail')).toHaveTextContent('c9')
  })

  test('con ver=<EN JUEGO sin jugar> aplica el anti-spoiler: manda a jugar, no al detalle', async () => {
    window.location.hash = '#g=g1&ver=c9'
    mockTripData({
      pastChallenges: [{ challengeId: 'c9', status: 'active', myResult: null }] as Past,
    })
    const onPlay = vi.fn()
    render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <TripPage
            groupId="g1"
            onPlayChallenge={onPlay}
            onAddMoment={vi.fn()}
            onAddChallenge={vi.fn()}
            onBack={vi.fn()}
          />
        </ToastProvider>
      </SessionContext.Provider>,
    )
    await vi.waitFor(() => expect(onPlay).toHaveBeenCalledWith('c9'))
    expect(screen.queryByTestId('challenge-detail')).not.toBeInTheDocument()
  })

  test('con m=<momento> reabre la hoja del momento cuando llegan los datos', async () => {
    window.location.hash = '#g=g1&m=m1'
    mockTripData({
      moments: [activeChallenge({ challengeId: 'm1', isChallenge: false, status: 'closed' })],
    })
    renderTrip()
    expect(await screen.findByTestId('moment-sheet')).toHaveTextContent('m1')
  })
})
