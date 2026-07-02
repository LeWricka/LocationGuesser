import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { ChallengeForPlay } from '../../lib/challenges'

// Mocks de la capa de datos: aislamos Supabase. Solo cubrimos la guarda "es
// tuyo" (#509); el resto del flujo de jugar (mapa, Street View) no se llega a
// montar en ese camino, así que no hace falta mockear PlayMap/StreetViewPano.
const getChallengeMock = vi.fn<() => Promise<ChallengeForPlay>>()
const getExistingVoteMock = vi.fn<() => Promise<unknown>>()
const getVotesMock = vi.fn<() => Promise<unknown[]>>()
const getAnswerMock = vi.fn<() => Promise<unknown>>()
const getGroupMock = vi.fn<() => Promise<unknown>>()

vi.mock('../../lib/challenges', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    getChallenge: () => getChallengeMock(),
    getAnswer: () => getAnswerMock(),
  }
})

vi.mock('../../lib/votes', () => ({
  getExistingVote: () => getExistingVoteMock(),
  getVotes: () => getVotesMock(),
  deleteMyVote: vi.fn(),
  submitVote: vi.fn(),
}))

vi.mock('../../lib/groupData', () => ({
  getGroup: () => getGroupMock(),
}))

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }))
vi.mock('../../lib/useSignedImage', () => ({ useSignedImage: () => null }))
// El flujo normal (no-guard) monta GameScene, que renderiza SIEMPRE el mini-mapa
// (colapsado o no); PlayMap exige un <ApiProvider> de Google Maps que este test no
// monta (fuera de alcance: solo verificamos que el guard "es tuyo" no rompe el
// camino feliz). Stub sin comportamiento.
vi.mock('./PlayMap', () => ({ PlayMap: () => null }))

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

import { PlayChallenge } from './PlayChallenge'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const baseChallenge: ChallengeForPlay = {
  id: 'c1',
  group_id: 'g1',
  title: 'La plaza del pueblo',
  description: null,
  is_challenge: true,
  place_lat: null,
  place_lng: null,
  image_path: null,
  sv_pano_id: null,
  sv_heading: null,
  sv_pitch: null,
  guess_seconds: null,
  deadline_at: '2026-12-31T23:59:59.999Z',
  photo_is_hint: true,
  sv_lock_move: false,
  sv_lock_rotate: false,
  score_scale: 'mundo',
  challenge_kind: 'location',
  number_question: null,
  number_unit: null,
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
  verified: true,
  refreshProfile: async () => {},
}

function renderPlay() {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <PlayChallenge challengeId="c1" groupId="g1" />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMatchMedia(false)
  getExistingVoteMock.mockResolvedValue(null)
  getVotesMock.mockResolvedValue([])
  getGroupMock.mockResolvedValue({ id: 'g1', name: 'Viaje a Iruña' })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('PlayChallenge — guarda "es tuyo" (#509)', () => {
  test('el creador ve el estado "Este reto es tuyo" en vez del juego', async () => {
    getChallengeMock.mockResolvedValue({ ...baseChallenge, created_by: 'u-me' })
    getVotesMock.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])

    renderPlay()

    expect(await screen.findByText('Este reto es tuyo')).toBeInTheDocument()
    expect(screen.getByText('2 personas han votado.')).toBeInTheDocument()
    // No se monta el juego: nunca aparece el overlay "Empezar".
    expect(screen.queryByRole('button', { name: 'Empezar' })).not.toBeInTheDocument()
    // Tampoco se llama a getExistingVote (el guard corta antes de esa lógica).
    expect(getExistingVoteMock).not.toHaveBeenCalled()
  })

  test('"Ver marcador" navega a la pestaña Marcador del viaje (no al Diario)', async () => {
    getChallengeMock.mockResolvedValue({ ...baseChallenge, created_by: 'u-me' })
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: /Ver marcador/ }))
    expect(window.location.hash).toBe('#g=g1&v=marcador')
  })

  test('un reto ajeno sigue mostrando el flujo normal de jugar', async () => {
    getChallengeMock.mockResolvedValue(baseChallenge) // created_by: 'u-other'
    renderPlay()

    expect(await screen.findByRole('button', { name: 'Empezar' })).toBeInTheDocument()
    expect(screen.queryByText('Este reto es tuyo')).not.toBeInTheDocument()
  })
})
