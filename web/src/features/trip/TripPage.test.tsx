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

// Onboarding del CREADOR (pieza 3/4), pulido tras feedback del fundador: la
// sugerencia y el remate DEJAN de ser tarjetas/banners flotantes (el fundador
// reportó la sugerencia ilegible sobre el mapa) y pasan a reutilizar el MISMO
// `CoachMark` que ya usa el paso "coach" — scrim sólido + burbuja legible,
// anclado a un elemento REAL (`fabButtonRef`/`tabBarRef`, ver TripPage). Las
// banderas de paso viven en localStorage (`lg:onboarding:creador:<paso>:<uid>`,
// ver useCreadorOnboarding) — las precargamos para caer directo en el paso que
// se prueba, sin tener que simular todo el recorrido.
describe('TripPage — onboarding creador: sugerencia y remate anclados a un elemento real', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = '#g=g1'
  })

  function seenSteps(...steps: Array<'intro' | 'suggest' | 'share'>) {
    for (const step of steps) localStorage.setItem(`lg:onboarding:creador:${step}:u-me`, '1')
  }

  test('sugerencia: CoachMark legible (no la tarjeta translúcida vieja) anclado al "+"', async () => {
    seenSteps('intro')
    mockTripData({
      moments: [
        activeChallenge({
          challengeId: 'm1',
          isChallenge: false,
          status: 'closed',
          imageUrl: null,
        }),
      ],
    })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    renderTrip()

    const bubble = await screen.findByRole('note', {
      name: '¿Y si les lanzas un reto para que viajen contigo?',
    })
    expect(bubble).toHaveTextContent('Tu gente adivina dónde es. Gana quien más se acerca.')

    // La tarjeta flotante translúcida de antes ya no existe (su × tenía este label).
    expect(screen.queryByLabelText('Cerrar sugerencia')).not.toBeInTheDocument()

    // Anclado al "+" real (mismo nodo que mide CoachMark), no un elemento cualquiera.
    const fab = screen.getByRole('button', { name: 'Crear momento o reto' })
    await vi.waitFor(() => expect(rectSpy.mock.instances).toContain(fab))

    await userEvent.click(screen.getByRole('button', { name: 'Crear un reto' }))
    expect(window.location.hash).toBe('#g=g1&add=reto&promote=m1')

    rectSpy.mockRestore()
  })

  test('sugerencia: "Saltar" descarta el paso sin crear el reto', async () => {
    seenSteps('intro')
    mockTripData({ moments: [activeChallenge({ challengeId: 'm1', isChallenge: false })] })
    renderTrip()

    await screen.findByRole('note', { name: '¿Y si les lanzas un reto para que viajen contigo?' })
    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }))

    expect(
      screen.queryByRole('note', { name: '¿Y si les lanzas un reto para que viajen contigo?' }),
    ).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#g=g1')
    expect(localStorage.getItem('lg:onboarding:creador:suggest:u-me')).toBe('1')
  })

  test('remate: CoachMark anclado a la barra de pestañas, nombra Diario/Bitácora/Marcador', async () => {
    seenSteps('intro', 'suggest', 'share')
    // `activeChallenge` deja isChallenge:true por defecto → challengeCount > 0.
    mockTripData({ moments: [activeChallenge({ challengeId: 'c1' })] })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    renderTrip()

    const bubble = await screen.findByRole('note', { name: 'Así queda todo' })
    expect(bubble).toHaveTextContent(
      'Todo queda en tu Diario y tu Bitácora; en el Marcador ves quién va ganando.',
    )

    // Anclado a la barra Diario·Bitácora·Marcador (su wrapper, `tabBarRef`), no
    // un banner suelto abajo.
    const tabBar = screen.getByRole('radiogroup', { name: 'Secciones del viaje' }).parentElement
    await vi.waitFor(() => expect(rectSpy.mock.instances).toContain(tabBar))

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('note', { name: 'Así queda todo' })).not.toBeInTheDocument()
    expect(localStorage.getItem('lg:onboarding:creador:remate:u-me')).toBe('1')

    rectSpy.mockRestore()
  })
})
