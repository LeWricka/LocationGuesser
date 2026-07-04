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

const startPlayMock = vi.fn<() => Promise<void>>()

vi.mock('../../lib/votes', () => ({
  getExistingVote: () => getExistingVoteMock(),
  getVotes: () => getVotesMock(),
  deleteMyVote: vi.fn(),
  submitVote: vi.fn(),
  startPlay: () => startPlayMock(),
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
  audio_path: null,
  video_path: null,
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
  startPlayMock.mockResolvedValue(undefined)
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

// Issue #628: la velocidad puntúa en el reto de lugar.
describe('PlayChallenge — la velocidad puntúa (#628)', () => {
  test('al pulsar Empezar se registra el arranque server-side (RPC start_play)', async () => {
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 30 })
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))

    // Fire-and-forget desde `start()`: no espera a la cuenta atrás para llamar.
    expect(startPlayMock).toHaveBeenCalledTimes(1)
  })

  test('revelado tras recargar un voto ya emitido: "Respondiste en Xs" + nota del factor', async () => {
    // elapsed=6s de un límite de 30s con time_scoring ON → factor 0,9 (ejemplo
    // del propio issue: "×0,9 por rapidez").
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 30, time_scoring: true })
    getExistingVoteMock.mockResolvedValue({
      id: 'v1',
      group_id: 'g1',
      challenge_id: 'c1',
      user_id: 'u-me',
      guess_lat: 40,
      guess_lng: -3,
      distance_km: 12,
      guess_number: null,
      abs_error: null,
      points: 2000,
      left_app: false,
      elapsed_seconds: 6,
      play_started_at: '2026-06-19T10:00:00.000Z',
      created_at: '2026-06-19T10:00:06.000Z',
    })
    getAnswerMock.mockResolvedValue({ lat: 40.01, lng: -3.01 })

    renderPlay()

    // Texto en un único <span> (icono + tiempo + nota): match EXACTO para no
    // ambigüar con ancestros que también "contienen" el mismo substring.
    expect(await screen.findByText('Respondiste en 6s · ×0,9 por rapidez')).toBeInTheDocument()
  })

  test('sin arranque registrado (play_started_at null): muestra el tiempo, SIN nota de factor', async () => {
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 30, time_scoring: true })
    getExistingVoteMock.mockResolvedValue({
      id: 'v1',
      group_id: 'g1',
      challenge_id: 'c1',
      user_id: 'u-me',
      guess_lat: 40,
      guess_lng: -3,
      distance_km: 12,
      guess_number: null,
      abs_error: null,
      points: 2000,
      left_app: false,
      elapsed_seconds: 6,
      // Sin arranque: start_play falló o es legacy — degradación honesta, no se
      // puede confirmar que aplicó un factor, así que no se estima ninguno.
      play_started_at: null,
      created_at: '2026-06-19T10:00:06.000Z',
    })
    getAnswerMock.mockResolvedValue({ lat: 40.01, lng: -3.01 })

    renderPlay()

    expect(await screen.findByText('Respondiste en 6s')).toBeInTheDocument()
    expect(screen.queryByText(/por rapidez/)).not.toBeInTheDocument()
  })

  test('reto SIN límite ("Libre"): ni tiempo ni nota, aunque haya elapsed_seconds', async () => {
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: null })
    getExistingVoteMock.mockResolvedValue({
      id: 'v1',
      group_id: 'g1',
      challenge_id: 'c1',
      user_id: 'u-me',
      guess_lat: 40,
      guess_lng: -3,
      distance_km: 12,
      guess_number: null,
      abs_error: null,
      // Por debajo del umbral de "gran tiro" (75% de 5000): mantiene el titular
      // "Resultado" (no "¡Gran tiro!"), que es lo que espera este test.
      points: 2000,
      left_app: false,
      elapsed_seconds: 45,
      play_started_at: '2026-06-19T10:00:00.000Z',
      created_at: '2026-06-19T10:00:45.000Z',
    })
    getAnswerMock.mockResolvedValue({ lat: 40.01, lng: -3.01 })

    renderPlay()

    await screen.findByText('Resultado')
    expect(screen.queryByText(/Respondiste en/)).not.toBeInTheDocument()
  })
})
