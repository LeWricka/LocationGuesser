import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { ChallengeForPlay } from '../../lib/challenges'

// Mocks de la capa de datos: aislamos Supabase. Solo cubrimos la guarda "es
// tuyo" (#509); el resto del flujo de jugar (mapa, Street View) no se llega a
// montar en ese camino, así que no hace falta mockear PlayMap/StreetViewPano.
const getChallengeMock = vi.fn<() => Promise<ChallengeForPlay | null>>()
const getExistingVoteMock = vi.fn<() => Promise<unknown>>()
const getVotesMock = vi.fn<() => Promise<unknown[]>>()
const getAnswerMock = vi.fn<() => Promise<unknown>>()
const getGroupMock = vi.fn<() => Promise<unknown>>()

vi.mock('../../lib/challenges', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    getChallengeOrNull: () => getChallengeMock(),
    getAnswer: () => getAnswerMock(),
  }
})

const startPlayMock = vi.fn<() => Promise<void>>()
const submitVoteMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()

vi.mock('../../lib/votes', () => ({
  getExistingVote: () => getExistingVoteMock(),
  getVotes: () => getVotesMock(),
  deleteMyVote: vi.fn(),
  submitVote: (...args: unknown[]) => submitVoteMock(...args),
  startPlay: () => startPlayMock(),
}))

vi.mock('../../lib/groupData', () => ({
  getGroup: () => getGroupMock(),
}))

// Nombre repetido = puerta de recuperación (issue #756): `getGroupMembers`
// alimenta la comprobación de colisión en `submitName`; por defecto sin
// miembros (sin colisión posible) salvo que un test la sobreescriba.
const getGroupMembersMock = vi.fn<() => Promise<{ userId: string; name: string }[]>>()
vi.mock('../../lib/membership', () => ({
  getGroupMembers: () => getGroupMembersMock(),
}))

// Intensidad del CTA a partir de la 2ª partida (issue #756): `getGroupVotes`
// alimenta el tally del anónimo; `aggregateLeaderboard` se deja REAL (función
// pura, ya probada en leaderboard.test.ts) para no reimplementar su lógica aquí.
const getGroupVotesMock = vi.fn<() => Promise<unknown[]>>()
vi.mock('../../lib/leaderboard', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/leaderboard')>()
  return {
    ...actual,
    getGroupVotes: () => getGroupVotesMock(),
  }
})

// Nombre antes de revelar (issue #758): `upsertProfile` real toca Supabase (lanza
// sin env vars en test); lo aislamos igual que el resto de la capa de datos.
const upsertProfileMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/profile', () => ({
  upsertProfile: (...args: unknown[]) => upsertProfileMock(...args),
}))

// "Guárdate" (issue #758): stub sin comportamiento — el flujo de vincular email
// se prueba en useAccountUpgrade.test.ts/AccountUpgradeModal, no aquí.
// "¿Eres tú?" (issue #756): stub también — el login de recuperación se prueba
// en useMagicLink/RecoverIdentityModal, no aquí (solo el wiring del conflicto).
vi.mock('../auth', () => ({
  AccountUpgradeModal: () => null,
  RecoverIdentityModal: () => null,
}))

// Referencia estable al mock de `track` (issue #756): la necesitamos para
// comprobar el outcome 'conflict' de `name_prompt_submitted`, no solo que el
// evento se emita.
const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))
// Issue #760: espiamos ambas para comprobar que un recurso borrado (esperable)
// deja breadcrumb, NUNCA una excepción — el resto de tests no las inspecciona.
const reportErrorMock = vi.fn()
const addBreadcrumbMock = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}))
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
import { ResourceGoneError } from '../../lib/errors'

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
  isAnonymous: false,
  refreshProfile: async () => {},
}

function renderPlay(overrides: Partial<SessionState> = {}) {
  return render(
    <SessionContext.Provider value={{ ...session, ...overrides }}>
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
  submitVoteMock.mockResolvedValue({
    distanceKm: null,
    points: 0,
    answerLat: null,
    answerLng: null,
    speedFactor: 1,
  })
  upsertProfileMock.mockResolvedValue({})
  getGroupMembersMock.mockResolvedValue([])
  getGroupVotesMock.mockResolvedValue([])
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

// Issue #760 (caso real: LOCATIONGUESSER-Z/-10 en un mismo usuario iPhone que
// abrió un enlace a un reto ya borrado): estado amable en vez de error crudo,
// tanto al CARGAR (0 filas) como al VOTAR (P0002, se borró con la pantalla
// abierta).
describe('PlayChallenge — reto borrado (issue #760)', () => {
  test('al cargar (0 filas): "Este reto ya no existe" + CTA al viaje, sin excepción a Sentry', async () => {
    getChallengeMock.mockResolvedValue(null)

    renderPlay()

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
    // Con groupId, tanto el "atrás" de arriba como la CTA dicen "Volver al
    // viaje": comprobamos las DOS apariciones en vez de una sola, ambigua.
    expect(screen.getAllByRole('button', { name: 'Volver al viaje' })).toHaveLength(2)
    // Nunca pantalla en blanco / esqueleto colgado.
    expect(screen.queryByRole('status', { name: 'Cargando el reto' })).not.toBeInTheDocument()
    expect(reportErrorMock).not.toHaveBeenCalled()
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      'challenge_gone_on_load',
      expect.objectContaining({ challengeId: 'c1' }),
    )
  })

  test('sin groupId (enlace suelto): la CTA del estado borrado va a Inicio', async () => {
    getChallengeMock.mockResolvedValue(null)

    render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <PlayChallenge challengeId="c1" />
        </ToastProvider>
      </SessionContext.Provider>,
    )

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
    // Sin groupId, tanto el "atrás" de arriba como la CTA caen a "Inicio" (no
    // "Volver al viaje"): comprobamos las DOS apariciones en vez de una sola,
    // ambigua por `getByRole`.
    expect(screen.getAllByRole('button', { name: 'Inicio' })).toHaveLength(2)
    expect(screen.queryByText('Volver al viaje')).not.toBeInTheDocument()
  })

  test('al votar (P0002, se borró con la pantalla abierta): mismo estado amable, sin excepción a Sentry', async () => {
    // guess_seconds: 0 + reduced-motion (salta la cuenta atrás 3·2·1) hace que el
    // reloj llegue a cero en el primer tick sin pin colocado → dispara el voto de
    // timeout, el mismo patrón que usan los tests de "nombre antes de revelar"
    // más abajo para forzar `reveal()` sin depender del mapa (stubeado).
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    submitVoteMock.mockRejectedValue(new ResourceGoneError('Este reto ya no existe'))
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))

    expect(await screen.findByText('Este reto ya no existe')).toBeInTheDocument()
    expect(submitVoteMock).toHaveBeenCalledTimes(1)
    expect(reportErrorMock).not.toHaveBeenCalled()
    expect(addBreadcrumbMock).toHaveBeenCalledWith(
      'challenge_gone_on_vote',
      expect.objectContaining({ challengeId: 'c1' }),
    )
    // No se cuela el toast crudo de "No se pudo guardar: …".
    expect(screen.queryByText(/No se pudo guardar/)).not.toBeInTheDocument()
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

// Issue #758: el receptor sin cuenta vota con una sesión ANÓNIMA; el nombre
// para el marcador se pide una sola vez, justo antes de revelar.
describe('PlayChallenge — nombre antes de revelar para el receptor anónimo (issue #758)', () => {
  // guess_seconds: 0 + reduced-motion (salta la cuenta atrás 3·2·1) hace que el
  // reloj de la jugada llegue a cero en el primer tick, sin pin colocado: un
  // voto de timeout. Sirve igual para probar la puerta del nombre (no depende
  // de si hubo pin o no) sin tener que simular un clic en el mapa real.
  test('anónimo SIN nombre: al agotarse el tiempo, pide nombre ANTES de votar; al guardarlo, revela y ofrece "guárdate"', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    const u = userEvent.setup()
    renderPlay({ isAnonymous: true, profile: null })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))

    // El nombre se pide ANTES de votar.
    expect(await screen.findByText('¿Con qué nombre juegas?')).toBeInTheDocument()
    expect(submitVoteMock).not.toHaveBeenCalled()

    await u.type(screen.getByLabelText('Tu nombre'), 'Ane')
    await u.click(screen.getByRole('button', { name: 'Ver mi resultado' }))

    expect(upsertProfileMock).toHaveBeenCalledWith({ id: 'u-me', displayName: 'Ane' })
    // Retoma la jugada aparcada: vota (timeout, sin pin) y revela.
    await screen.findByText('No diste a tiempo')
    expect(submitVoteMock).toHaveBeenCalledTimes(1)
    // Tras jugar, el receptor anónimo ve el CTA opcional de guardar puntos
    // (issue #756: reencuadrado al beneficio; sin puntos por timeout, cae al
    // copy de "guarda tu progreso").
    expect(
      screen.getByRole('button', { name: 'Guarda tu progreso en Viaje a Iruña' }),
    ).toBeInTheDocument()
  })

  test('anónimo CON nombre ya elegido: vota directo, sin pedir nombre de nuevo', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    const u = userEvent.setup()
    renderPlay({
      isAnonymous: true,
      profile: {
        id: 'u-me',
        display_name: 'Ya tengo nombre',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        onboarding: {},
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))

    await screen.findByText('No diste a tiempo')
    expect(screen.queryByText('¿Con qué nombre juegas?')).not.toBeInTheDocument()
    expect(upsertProfileMock).not.toHaveBeenCalled()
    expect(submitVoteMock).toHaveBeenCalledTimes(1)
  })

  test('usuario con cuenta permanente (no anónimo): vota directo, sin nombre ni CTA de guardar', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    const u = userEvent.setup()
    renderPlay()

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))

    await screen.findByText('No diste a tiempo')
    expect(screen.queryByText('¿Con qué nombre juegas?')).not.toBeInTheDocument()
    expect(screen.queryByText(/Guarda tu progreso/)).not.toBeInTheDocument()
  })
})

// Issue #756: nombre repetido = puerta de recuperación, no duplicado en el
// marcador. La colisión se comprueba contra `getGroupMembers` (miembros YA
// existentes del viaje), case-insensitive y con trim.
describe('PlayChallenge — nombre repetido = puerta de recuperación (issue #756)', () => {
  test('el nombre coincide con otro miembro (case-insensitive/trim): "¿Eres tú?" en vez de guardarlo', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    getGroupMembersMock.mockResolvedValue([{ userId: 'u-otro-movil', name: 'Ane' }])
    const u = userEvent.setup()
    renderPlay({ isAnonymous: true, profile: null })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    await screen.findByText('¿Con qué nombre juegas?')

    // Con espacios y mayúsculas distintas: la comprobación es trim + lowercase.
    await u.type(screen.getByLabelText('Tu nombre'), '  ANE  ')
    await u.click(screen.getByRole('button', { name: 'Ver mi resultado' }))

    expect(await screen.findByText('¿Eres tú?')).toBeInTheDocument()
    expect(screen.getByText(/Ya hay un/)).toBeInTheDocument()
    // No se guarda el nombre ni se vota mientras la decisión está pendiente.
    expect(upsertProfileMock).not.toHaveBeenCalled()
    expect(submitVoteMock).not.toHaveBeenCalled()
    // Outcome 'conflict' en el mismo evento (issue #751), no uno nuevo.
    expect(trackMock).toHaveBeenCalledWith('name_prompt_submitted', {
      outcome: 'conflict',
      group_id: 'g1',
      challenge_id: 'c1',
    })
  })

  test('"No soy yo": vuelve al paso de nombre para elegir otro', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    getGroupMembersMock.mockResolvedValue([{ userId: 'u-otro-movil', name: 'Ane' }])
    const u = userEvent.setup()
    renderPlay({ isAnonymous: true, profile: null })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    await screen.findByText('¿Con qué nombre juegas?')
    await u.type(screen.getByLabelText('Tu nombre'), 'Ane')
    await u.click(screen.getByRole('button', { name: 'Ver mi resultado' }))
    await screen.findByText('¿Eres tú?')

    await u.click(screen.getByRole('button', { name: 'No soy yo' }))

    expect(await screen.findByText('¿Con qué nombre juegas?')).toBeInTheDocument()
    expect(upsertProfileMock).not.toHaveBeenCalled()
  })

  test('sin colisión (nombre libre): se guarda normal, sin pasar por "¿Eres tú?"', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    getGroupMembersMock.mockResolvedValue([{ userId: 'u-otro-movil', name: 'Beñat' }])
    const u = userEvent.setup()
    renderPlay({ isAnonymous: true, profile: null })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    await screen.findByText('¿Con qué nombre juegas?')
    await u.type(screen.getByLabelText('Tu nombre'), 'Ane')
    await u.click(screen.getByRole('button', { name: 'Ver mi resultado' }))

    expect(upsertProfileMock).toHaveBeenCalledWith({ id: 'u-me', displayName: 'Ane' })
    await screen.findByText('No diste a tiempo')
    expect(screen.queryByText('¿Eres tú?')).not.toBeInTheDocument()
  })
})

// Issue #756: a partir de la 2ª partida como anónimo EN ESTE VIAJE, el CTA de
// guardar puntos sube de intensidad (acumulado del viaje + variant primaria),
// reusando `getGroupVotes`/`aggregateLeaderboard` (ya existen para el
// marcador) en vez de una consulta nueva.
describe('PlayChallenge — intensidad del CTA a partir de la 2ª partida (issue #756)', () => {
  test('2ª partida o más: el CTA enseña el acumulado del viaje', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    getGroupVotesMock.mockResolvedValue([
      { user_id: 'u-me', points: 500, display_name: 'Ane', avatar: null },
      { user_id: 'u-me', points: 300, display_name: 'Ane', avatar: null },
    ])
    const u = userEvent.setup()
    renderPlay({
      isAnonymous: true,
      profile: {
        id: 'u-me',
        display_name: 'Ane',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        onboarding: {},
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    await screen.findByText('No diste a tiempo')

    expect(
      await screen.findByRole('button', { name: 'Llevas 2 partidas y 800 puntos — guárdalos' }),
    ).toBeInTheDocument()
  })

  test('1ª partida (sin tally de 2+): el CTA se queda en la versión de esta partida', async () => {
    mockMatchMedia(true)
    getChallengeMock.mockResolvedValue({ ...baseChallenge, guess_seconds: 0 })
    getGroupVotesMock.mockResolvedValue([
      { user_id: 'u-me', points: 0, display_name: 'Ane', avatar: null },
    ])
    const u = userEvent.setup()
    renderPlay({
      isAnonymous: true,
      profile: {
        id: 'u-me',
        display_name: 'Ane',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        onboarding: {},
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Empezar' }))
    await screen.findByText('No diste a tiempo')

    expect(screen.queryByRole('button', { name: /Llevas \d+ partidas/ })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guarda tu progreso en Viaje a Iruña' }),
    ).toBeInTheDocument()
  })
})
