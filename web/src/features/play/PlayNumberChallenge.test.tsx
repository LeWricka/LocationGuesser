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
    getChallenge: vi.fn(),
    getNumberAnswer: () => getNumberAnswerMock(),
  }
})

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }))
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

const numberChallenge: ChallengeForPlay = {
  id: 'n1',
  group_id: 'g1',
  title: 'La porra de la cena',
  description: null,
  is_challenge: true,
  place_lat: null,
  place_lng: null,
  image_path: null,
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
  created_by: 'u-other',
  created_at: '2026-06-19T10:00:00.000Z',
}

const user = { id: 'u-me' } as User

const session: SessionState = {
  session: null,
  user,
  profile: null,
  loading: false,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockMatchMedia(false)
  getExistingVoteMock.mockResolvedValue(null)
  getVotesWithNamesMock.mockResolvedValue([])
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
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

    await u.click(screen.getByRole('button', { name: /Bloquear mi número/ }))

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
