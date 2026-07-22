import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RefObject } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Moment } from '../../lib/trip'

// Mockeamos las piezas pesadas (datos, mapa, hojas, marcador incrustado) y los
// modales de compartir por stubs ligeros. `useTripData` es un mock CONTROLABLE
// (vi.fn) para poder variar moments/leaderboard por test — la hoja "Compartir"
// nueva (issue #758) decide qué items ofrece según esos datos.
vi.mock('./useTripData', () => ({ useTripData: vi.fn() }))

// TripDiario/BitacoraTab/MarcadorTab van por stub: pesados y no es lo que se
// prueba aquí. REENVÍAN los refs del tour (issue #891) a un nodo real para que
// los coach-marks del `GuidedTour` tengan objetivo medible en jsdom (si el ref
// queda sin nodo, `CoachMark` no pinta y el tour no avanzaría en el test).
vi.mock('./TripDiario', () => ({
  TripDiario: ({ mapRef }: { mapRef?: RefObject<HTMLDivElement | null> }) => (
    <div data-testid="diario" ref={mapRef} />
  ),
}))
vi.mock('./BitacoraTab', () => ({
  // `<section>` usa HTMLElement (no HTMLDivElement), que casa con el tipo de
  // `firstDayRef` sin castear.
  BitacoraTab: ({ firstDayRef }: { firstDayRef?: RefObject<HTMLElement | null> }) => (
    <section data-testid="bitacora" ref={firstDayRef} />
  ),
}))
vi.mock('./MarcadorTab', () => ({
  MarcadorTab: ({ podioRef }: { podioRef?: RefObject<HTMLOListElement | null> }) => (
    <ol data-testid="marcador" ref={podioRef} />
  ),
}))
// Solo se sustituye AccountUpgradeModal (el resto del barril —p.ej.
// usePushAvailability, que usa PushOptInPrompt— se conserva con importOriginal).
vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>()
  return {
    ...actual,
    AccountUpgradeModal: ({
      open,
      origin,
      title,
    }: {
      open: boolean
      origin: string
      title?: string
    }) =>
      open ? <div data-testid="account-upgrade-modal">{`${origin}|${title ?? ''}`}</div> : null,
  }
})
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

// jsdom no implementa scrollIntoView; el GuidedTour del tour del reto (#891) lo
// usa para llevar cada paso a la vista.
Element.prototype.scrollIntoView = vi.fn()

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

// Gating de FABs a ANÓNIMOS: el "Compartir" sigue oculto (issue #888 — jugar un
// reto no convierte al receptor en quien re-comparte). El "+" VUELVE a verse
// (issue #891) pero, al tocarlo, pide cuenta ("Regístrate para crear tus
// viajes") en vez de abrir el menú Momento/Reto que no puede completar.
describe('TripPage — FABs para usuarios ANÓNIMOS (#888/#891)', () => {
  const anonSession: SessionState = { ...session, isAnonymous: true }

  function renderTripAnon() {
    window.location.hash = '#g=g1'
    render(
      <SessionContext.Provider value={anonSession}>
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

  test('anónimo: el "Compartir" sigue oculto, pero el "+" SÍ se ve (#891)', async () => {
    mockTripData()
    renderTripAnon()
    // `canCreate` se confirma async (isMember/myGroups mockeados): esperamos a
    // que la pantalla asiente antes de afirmar presencia/ausencia.
    expect(await screen.findByRole('radio', { name: 'Marcador' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Regístrate para crear tus viajes' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^compartir$/i })).not.toBeInTheDocument()
  })

  test('anónimo: tocar el "+" abre el alta (no el menú Momento/Reto)', async () => {
    mockTripData()
    renderTripAnon()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Regístrate para crear tus viajes' }),
    )
    const modal = await screen.findByTestId('account-upgrade-modal')
    expect(modal).toHaveTextContent('anon_create_gate|Regístrate para crear tus viajes')
    // No abre el menú de crear: sus items no aparecen.
    expect(screen.queryByRole('menuitem', { name: /momento/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /reto/i })).not.toBeInTheDocument()
  })

  test('miembro con cuenta (no anónimo): SÍ ve los dos FABs', async () => {
    mockTripData()
    renderTrip()
    expect(await screen.findByRole('button', { name: 'Crear momento o reto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^compartir$/i })).toBeInTheDocument()
  })
})

// Tour del RETO COMPARTIDO en el viaje REAL (issue #891): quien acaba de jugar
// su primer reto suelto pulsa "Siguiente" en el revelado y aterriza aquí con
// `#g=…&tour=reto`. Recorre Diario → Bitácora → Marcador y remata con un
// registro opcional. (Los mapas reales se stubean; el recorrido de pestañas y el
// cierre —lo que orquesta TripPage— sí se ejercitan aquí.)
describe('TripPage — tour del reto compartido (#891)', () => {
  const anonSession: SessionState = { ...session, isAnonymous: true }

  function renderRetoTour() {
    window.location.hash = '#g=g1&tour=reto'
    render(
      <SessionContext.Provider value={anonSession}>
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

  test('arranca en el Diario y navega Diario → Bitácora → Marcador y remata con el registro', async () => {
    mockTripData()
    renderRetoTour()

    // Paso 1 — Diario (mapa/globo): el tour arranca aquí.
    expect(await screen.findByText('El viaje entero')).toBeInTheDocument()
    expect(screen.getByTestId('diario')).toBeInTheDocument()

    // Paso 2 — Bitácora: "Siguiente" cambia de pestaña (onBeforeShow).
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Todo el viaje, en orden')).toBeInTheDocument()
    expect(screen.getByTestId('bitacora')).toBeInTheDocument()

    // Paso 3 — Marcador (último): CTA "Listo", no "Ver cierre".
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Aquí se juega')).toBeInTheDocument()
    expect(screen.getByTestId('marcador')).toBeInTheDocument()

    // "Listo" remata con el registro opcional y limpia el tour del hash.
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(await screen.findByText('No pierdas tus retos')).toBeInTheDocument()
    expect(window.location.hash).not.toContain('tour=reto')
  })

  test('"Saltar" lleva al Marcador sin tarjeta de registro', async () => {
    mockTripData()
    renderRetoTour()
    await screen.findByText('El viaje entero')
    await userEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    // Queda en el Marcador (su pestaña), sin registro, y el tour sale del hash.
    expect(await screen.findByTestId('marcador')).toBeInTheDocument()
    expect(screen.queryByText('No pierdas tus retos')).not.toBeInTheDocument()
    expect(window.location.hash).not.toContain('tour=reto')
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
