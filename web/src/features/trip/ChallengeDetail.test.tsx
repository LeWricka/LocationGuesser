import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChallengeForPlay } from '../../lib/challenges'
import type { VoteWithName } from '../../lib/leaderboard'
import type { LatLng } from '../../lib/geo'
import type { Profile } from '../../lib/database.types'

// Mocks de la capa de datos (issue #800): `ChallengeDetail` se basta a sí mismo,
// así que aislamos exactamente lo que pide — reto, votos, respuesta (lugar y
// número), perfil del creador y la foto firmada. Mismo patrón que
// PlayChallenge.test.tsx (importActual conserva el resto de `lib/challenges`,
// p.ej. `isPracticeChallenge`, que aquí no se usa pero no debe romperse).
const getChallengeOrNullMock = vi.fn<() => Promise<ChallengeForPlay | null>>()
const getAnswerMock = vi.fn<() => Promise<LatLng | null>>()
const getNumberAnswerMock = vi.fn<() => Promise<number | null>>()
vi.mock('../../lib/challenges', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    getChallengeOrNull: () => getChallengeOrNullMock(),
    getAnswer: () => getAnswerMock(),
    getNumberAnswer: () => getNumberAnswerMock(),
  }
})

const getVotesWithNamesMock = vi.fn<() => Promise<VoteWithName[]>>()
vi.mock('../../lib/votes', () => ({
  getVotesWithNames: () => getVotesWithNamesMock(),
}))

const getProfileMock = vi.fn<() => Promise<Profile | null>>()
vi.mock('../../lib/profile', () => ({
  getProfile: () => getProfileMock(),
}))

const signedImageUrlMock = vi.fn<() => Promise<string | null>>()
vi.mock('../../lib/storage', () => ({
  signedImageUrl: () => signedImageUrlMock(),
}))

// Mapa de resultado (issue #797/#800): exige un <ApiProvider> de Google Maps que
// este test no monta; el wiring de pines/labels ya se prueba en
// AllGuessesMap.test.tsx. Stub que expone lo justo para comprobar que
// ChallengeDetail le pasa la respuesta y los votantes correctos.
vi.mock('../group/AllGuessesMap', () => ({
  AllGuessesMap: ({
    answer,
    guesses,
    meUserId,
  }: {
    answer: LatLng
    guesses: { userId: string }[]
    meUserId?: string
  }) => (
    <div data-testid="all-guesses-map">
      {answer.lat},{answer.lng} · {guesses.length} jugadas · yo={meUserId ?? '—'}
    </div>
  ),
}))

function makeChallenge(overrides: Partial<ChallengeForPlay> = {}): ChallengeForPlay {
  return {
    id: 'c1',
    group_id: 'g1',
    title: 'El bosque de bambú',
    description: null,
    is_challenge: true,
    place_lat: null,
    place_lng: null,
    image_path: null,
    audio_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    sv_lock_move: false,
    sv_lock_rotate: false,
    guess_seconds: null,
    // En el pasado por defecto: reto CERRADO (isLive → false).
    deadline_at: '2026-06-01T10:00:00.000Z',
    photo_is_hint: true,
    score_scale: 'mundo',
    challenge_kind: 'location',
    number_question: null,
    number_unit: null,
    number_decimals: 0,
    number_tolerance: 'normal',
    time_scoring: true,
    happened_on: null,
    created_by: 'u-iker',
    created_at: '2026-05-01T10:00:00.000Z',
    ...overrides,
  } as unknown as ChallengeForPlay
}

function makeVote(overrides: Partial<VoteWithName>): VoteWithName {
  return {
    id: 'v1',
    group_id: 'g1',
    challenge_id: 'c1',
    user_id: 'u-otro',
    display_name: 'Otro',
    avatar: null,
    points: 0,
    distance_km: null,
    guess_lat: null,
    guess_lng: null,
    guess_number: null,
    abs_error: null,
    left_app: false,
    elapsed_seconds: null,
    play_started_at: null,
    created_at: '2026-06-01T09:00:00.000Z',
    ...overrides,
  }
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u-iker',
    display_name: 'Iker',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    onboarding: {},
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

// Import DESPUÉS de los `vi.mock` (hoisted igual): mismo orden que
// PlayChallenge.test.tsx.
import { ChallengeDetail } from './ChallengeDetail'

describe('ChallengeDetail (issue #800)', () => {
  test('reto cerrado: clasificación ordenada por puntos, mapa con las jugadas y foto', async () => {
    getChallengeOrNullMock.mockResolvedValue(makeChallenge({ image_path: 'photo-bambu.jpg' }))
    getVotesWithNamesMock.mockResolvedValue([
      makeVote({
        id: 'v-yo',
        user_id: 'u-me',
        display_name: 'Yo',
        points: 3100,
        distance_km: 42,
        guess_lat: 1,
        guess_lng: 2,
      }),
      makeVote({
        id: 'v-marta',
        user_id: 'u-marta',
        display_name: 'Marta',
        points: 4880,
        distance_km: 1.2,
        left_app: true,
        guess_lat: 3,
        guess_lng: 4,
      }),
    ])
    getAnswerMock.mockResolvedValue({ lat: 35.01, lng: 135.7 })
    getNumberAnswerMock.mockResolvedValue(null)
    getProfileMock.mockResolvedValue(makeProfile())
    signedImageUrlMock.mockResolvedValue('https://x/foto.jpg')

    render(<ChallengeDetail challengeId="c1" myUserId="u-me" onClose={vi.fn()} />)

    expect(await screen.findByText('El bosque de bambú')).toBeInTheDocument()
    expect(screen.getByText('Cerrado')).toBeInTheDocument()
    expect(screen.getByText(/Creado por/)).toHaveTextContent('Iker')

    // Clasificación: Marta (4880) por delante de Yo (3100), el propio destacado.
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent('Marta')
    // Separador de miles opcional: el Node de CI puede traer ICU reducido
    // (sin datos es-ES completos) y formatear sin punto — mismo criterio que
    // MarcadorTab.test.tsx (`/4.?880 pts/`).
    expect(filas[0]).toHaveTextContent(/4\.?880 pts/)
    expect(filas[1]).toHaveTextContent('Yo')
    expect(filas[1]).toHaveTextContent('Tú')
    expect(screen.getByLabelText('Salió de la app durante la jugada')).toBeInTheDocument()

    // Mapa con las jugadas de TODOS (issue #800, reusa AllGuessesMap de #797).
    const map = screen.getByTestId('all-guesses-map')
    expect(map).toHaveTextContent('35.01,135.7')
    expect(map).toHaveTextContent('2 jugadas')
    expect(map).toHaveTextContent('yo=u-me')

    // Foto ampliable (ChallengePhoto ya integra Lightbox).
    expect(screen.getByRole('img', { name: 'El bosque de bambú' })).toHaveAttribute(
      'src',
      'https://x/foto.jpg',
    )
  })

  test('reto ya no existe (borrado): estado amable, no revienta', async () => {
    getChallengeOrNullMock.mockResolvedValue(null)

    render(<ChallengeDetail challengeId="c1" myUserId="u-me" onClose={vi.fn()} />)

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
  })

  test('anti-spoiler (respuesta null por RLS): el mapa no revienta, muestra una nota en su lugar', async () => {
    // Caso defensivo: un reto propio EN JUEGO no tiene respuesta visible para
    // mí todavía — la lista de "Retos anteriores" ya evita mandar aquí un EN
    // JUEGO sin jugar, pero el componente debe cubrirse igual (issue #800:
    // "maneja el null con gracia").
    getChallengeOrNullMock.mockResolvedValue(
      makeChallenge({
        created_by: 'u-me',
        deadline_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    )
    getVotesWithNamesMock.mockResolvedValue([])
    getAnswerMock.mockResolvedValue(null)
    getNumberAnswerMock.mockResolvedValue(null)
    getProfileMock.mockResolvedValue(makeProfile({ id: 'u-me', display_name: 'Yo' }))
    signedImageUrlMock.mockResolvedValue(null)

    render(<ChallengeDetail challengeId="c1" myUserId="u-me" onClose={vi.fn()} />)

    expect(await screen.findByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.getByText('El mapa se revela al cerrarse el reto.')).toBeInTheDocument()
    expect(screen.queryByTestId('all-guesses-map')).not.toBeInTheDocument()
    expect(screen.getByText('Nadie ha jugado todavía.')).toBeInTheDocument()
  })

  test('reto de número: sin mapa, muestra la respuesta correcta y el error de cada jugador', async () => {
    getChallengeOrNullMock.mockResolvedValue(
      makeChallenge({
        challenge_kind: 'number',
        number_question: '¿Cuántos escalones tiene el templo?',
        number_unit: 'escalones',
      }),
    )
    getVotesWithNamesMock.mockResolvedValue([
      makeVote({ id: 'v-yo', user_id: 'u-me', display_name: 'Yo', points: 900, guess_number: 120 }),
    ])
    getAnswerMock.mockResolvedValue(null)
    getNumberAnswerMock.mockResolvedValue(131)
    getProfileMock.mockResolvedValue(makeProfile())
    signedImageUrlMock.mockResolvedValue(null)

    render(<ChallengeDetail challengeId="c1" myUserId="u-me" onClose={vi.fn()} />)

    expect(await screen.findByText('¿Cuántos escalones tiene el templo?')).toBeInTheDocument()
    expect(screen.getByText(/La respuesta era/)).toHaveTextContent('131 escalones')
    expect(screen.queryByTestId('all-guesses-map')).not.toBeInTheDocument()
    expect(screen.getByText('120 escalones')).toBeInTheDocument()
  })

  test('cerrar: la X llama a onClose', async () => {
    const user = userEvent.setup()
    getChallengeOrNullMock.mockResolvedValue(makeChallenge())
    getVotesWithNamesMock.mockResolvedValue([])
    getAnswerMock.mockResolvedValue({ lat: 1, lng: 2 })
    getNumberAnswerMock.mockResolvedValue(null)
    getProfileMock.mockResolvedValue(makeProfile())
    signedImageUrlMock.mockResolvedValue(null)
    const onClose = vi.fn()

    render(<ChallengeDetail challengeId="c1" myUserId="u-me" onClose={onClose} />)
    await screen.findByText('El bosque de bambú')

    await user.click(screen.getByRole('button', { name: 'Cerrar detalle del reto' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
