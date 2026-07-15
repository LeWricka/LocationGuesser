import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { ChallengeForPlay } from '../../lib/challenges'
import type { SubmitNumberVoteResultClient } from '../../lib/votes'

// Mocks de la capa de datos: aislamos Supabase. El componente solo orquesta estas
// funciones + UI kit. submitNumberVote es la pieza clave a verificar.
const submitNumberVoteMock = vi.fn<() => Promise<SubmitNumberVoteResultClient>>()
const getExistingVoteMock = vi.fn<() => Promise<unknown>>()
const getVotesWithNamesMock = vi.fn<() => Promise<unknown[]>>()
const getNumberAnswerMock = vi.fn<() => Promise<number | null>>()
// Issue #760: sin `preloaded`, el componente carga el reto él mismo.
const getChallengeOrNullMock = vi.fn<() => Promise<ChallengeForPlay | null>>()

vi.mock('../../lib/votes', () => ({
  submitNumberVote: () => submitNumberVoteMock(),
  getExistingVote: () => getExistingVoteMock(),
  getVotesWithNames: () => getVotesWithNamesMock(),
  deleteMyVote: vi.fn(),
}))

vi.mock('../../lib/challenges', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    getChallengeOrNull: () => getChallengeOrNullMock(),
    getNumberAnswer: () => getNumberAnswerMock(),
  }
})

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))
// Issue #760: espiamos ambas para comprobar que un recurso borrado (esperable)
// deja breadcrumb, NUNCA una excepción.
const reportErrorMock = vi.fn()
const addBreadcrumbMock = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}))
vi.mock('../../lib/useSignedImage', () => ({ useSignedImage: () => null }))

// matchMedia (useReducedMotion). Sin reduced-motion para un flujo normal.
function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

import { PlayNumberChallenge } from './PlayNumberChallenge'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'
import { ResourceGoneError } from '../../lib/errors'

const numberChallenge: ChallengeForPlay = {
  id: 'n1',
  group_id: 'g1',
  title: 'La porra de la cena',
  description: null,
  is_challenge: true,
  place_lat: null,
  place_lng: null,
  image_path: null,
  audio_path: null,
  video_path: null,
  sv_pano_id: null,
  sv_heading: null,
  sv_pitch: null,
  guess_seconds: null, // sin límite: no arranca el reloj en el test
  deadline_at: '2026-12-31T23:59:59.999Z',
  photo_is_hint: true,
  sv_lock_move: false,
  sv_lock_rotate: false,
  score_scale: 'mundo',
  challenge_kind: 'number',
  number_question: '¿Cuánto creéis que nos costó?',
  number_unit: '€',
  number_decimals: 0,
  number_tolerance: 'normal',
  time_scoring: true,
  happened_on: null,
  created_by: 'u-other',
  created_at: '2026-06-19T10:00:00.000Z',
}

const user = { id: 'u-me' } as User

const session: SessionState = {
  session: null,
  user,
  profile: null,
  loading: false,
  verified: true,
  isAnonymous: false,
  refreshProfile: async () => {},
}

function renderPlay() {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <PlayNumberChallenge challengeId="n1" groupId="g1" preloaded={numberChallenge} />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

// Issue #760: SIN `preloaded`, para probar la carga propia (getChallengeOrNull).
function renderPlayFresh(groupId: string | undefined = 'g1') {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <PlayNumberChallenge challengeId="n1" groupId={groupId} />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMatchMedia(false)
  getExistingVoteMock.mockResolvedValue(null)
  getVotesWithNamesMock.mockResolvedValue([])
  getChallengeOrNullMock.mockResolvedValue(numberChallenge)
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('PlayNumberChallenge', () => {
  test('muestra la pregunta y el overlay de empezar', async () => {
    renderPlay()
    // La pregunta se pinta sobre la foto.
    expect(await screen.findByText('¿Cuánto creéis que nos costó?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeInTheDocument()
  })

  test('bloquear el número llama a submit_number_vote y pinta el revelado', async () => {
    submitNumberVoteMock.mockResolvedValue({
      absError: 12,
      relError: 0.15,
      points: 1980,
      answerNumber: 84,
    })
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    // Sin reduced-motion la cuenta atrás 3·2·1 corre con timers reales: esperamos a
    // que el teclado quede activo (fase playing) tras ~3 s.
    const key7 = await screen.findByRole('button', { name: '7' }, { timeout: 5000 })
    await waitFor(() => expect(key7).toBeEnabled(), { timeout: 5000 })

    // Tecleamos 72 con el teclado propio.
    await u.click(screen.getByRole('button', { name: '7' }))
    await u.click(screen.getByRole('button', { name: '2' }))

    await u.click(screen.getByRole('button', { name: /Bloquear mi respuesta/ }))

    expect(submitNumberVoteMock).toHaveBeenCalledTimes(1)
    // Revelado: la cifra correcta grande + tu adivinanza (texto estático; los puntos
    // se animan con CountUp y no son fiables de aseverar al instante).
    expect(await screen.findByText('La respuesta era')).toBeInTheDocument()
    expect(screen.getByText('84 €')).toBeInTheDocument()
    expect(screen.getByText('72 €')).toBeInTheDocument()
  }, 15000)

  test('recarga con voto previo: salta directo al revelado con la cifra', async () => {
    getExistingVoteMock.mockResolvedValue({
      guess_number: 72,
      abs_error: 12,
      points: 1980,
      left_app: false,
    })
    getNumberAnswerMock.mockResolvedValue(84)
    renderPlay()
    expect(await screen.findByText('La respuesta era')).toBeInTheDocument()
    expect(screen.getByText('84 €')).toBeInTheDocument()
  })
})

describe('PlayNumberChallenge — guarda "es tuyo" (#509)', () => {
  test('el creador ve el estado "Este reto es tuyo" en vez del juego', async () => {
    getVotesWithNamesMock.mockResolvedValue([{ id: 'v1' }])
    render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <PlayNumberChallenge
            challengeId="n1"
            groupId="g1"
            preloaded={{ ...numberChallenge, created_by: 'u-me' }}
          />
        </ToastProvider>
      </SessionContext.Provider>,
    )

    expect(await screen.findByText('Este reto es tuyo')).toBeInTheDocument()
    expect(screen.getByText('1 persona ha votado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empezar' })).not.toBeInTheDocument()
    expect(getExistingVoteMock).not.toHaveBeenCalled()
  })

  test('"Ver marcador" navega a la pestaña Marcador del viaje (no al Diario)', async () => {
    getVotesWithNamesMock.mockResolvedValue([])
    const u = userEvent.setup()
    render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <PlayNumberChallenge
            challengeId="n1"
            groupId="g1"
            preloaded={{ ...numberChallenge, created_by: 'u-me' }}
          />
        </ToastProvider>
      </SessionContext.Provider>,
    )

    await u.click(await screen.findByRole('button', { name: 'Ver marcador' }))
    expect(window.location.hash).toBe('#g=g1&v=marcador')
  })
})

// Issue #760: HERMANA de los tests de PlayChallenge — mismo estado amable en el
// reto de NÚMERO, tanto al cargar (0 filas, sin `preloaded`) como al votar
// (P0002, se borró con la pantalla abierta).
describe('PlayNumberChallenge — reto borrado (issue #760)', () => {
  test('al cargar sin preloaded (0 filas): "Este reto ya no existe", sin excepción a Sentry', async () => {
    getChallengeOrNullMock.mockResolvedValue(null)

    renderPlayFresh()

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Volver al viaje' })).toHaveLength(2)
    expect(reportErrorMock).not.toHaveBeenCalled()
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      'challenge_gone_on_load',
      expect.objectContaining({ challengeId: 'n1', kind: 'number' }),
    )
  })

  test('al votar (P0002, se borró con la pantalla abierta): mismo estado amable, sin excepción a Sentry', async () => {
    submitNumberVoteMock.mockRejectedValue(new ResourceGoneError('Este reto ya no existe'))
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    const key7 = await screen.findByRole('button', { name: '7' }, { timeout: 5000 })
    await waitFor(() => expect(key7).toBeEnabled(), { timeout: 5000 })
    await u.click(screen.getByRole('button', { name: '7' }))
    await u.click(screen.getByRole('button', { name: '2' }))
    await u.click(screen.getByRole('button', { name: /Bloquear mi respuesta/ }))

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
    expect(submitNumberVoteMock).toHaveBeenCalledTimes(1)
    expect(reportErrorMock).not.toHaveBeenCalled()
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      'challenge_gone_on_vote',
      expect.objectContaining({ challengeId: 'n1', kind: 'number' }),
    )
    expect(screen.queryByText(/No se pudo guardar/)).not.toBeInTheDocument()
  }, 15000)
})
