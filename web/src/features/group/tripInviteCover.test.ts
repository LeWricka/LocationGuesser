import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ChallengeForPlay } from '../../lib/challenges'
import type { LatLng } from '../../lib/geo'

// Mockeamos solo `getGroup`/`getGroupChallenges` (pegan a Supabase); `splitByStatus`
// queda real (importOriginal), mismo patrón que useTripData.test.ts.
const getGroupMock = vi.fn()
const getGroupChallengesMock = vi.fn<(groupId: string) => Promise<ChallengeForPlay[]>>()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return {
    ...actual,
    getGroup: (...args: unknown[]) => getGroupMock(...args),
    getGroupChallenges: (groupId: string) => getGroupChallengesMock(groupId),
  }
})

const getAnswersMock = vi.fn<(ids: string[]) => Promise<Map<string, LatLng>>>()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, getAnswers: (ids: string[]) => getAnswersMock(ids) }
})

const resolvePlaceCoverMock = vi.fn()
vi.mock('../../lib/placeCover', () => ({
  resolvePlaceCover: (...args: unknown[]) => resolvePlaceCoverMock(...args),
}))

const storagePathToDataUrlMock = vi.fn()
const urlToDataUrlMock = vi.fn()
vi.mock('../create/challengeShareCover', () => ({
  storagePathToDataUrl: (...args: unknown[]) => storagePathToDataUrlMock(...args),
  urlToDataUrl: (...args: unknown[]) => urlToDataUrlMock(...args),
}))

// `resolveTripInviteCover` importa `resolveVisibleTripMoments`/`pickTripCoverImagePath`
// de `lib/tripCover` SIN mockear (es el módulo bajo prueba, #619): así el test
// ejercita el criterio canónico REAL, el mismo que usa `useWorldTrips` en la home.
import { resolveTripInviteCover } from './tripInviteCover'
import { resolveVisibleTripMoments, pickTripCoverImagePath } from '../../lib/tripCover'

function moment(overrides: Partial<ChallengeForPlay>): ChallengeForPlay {
  return {
    id: 'c1',
    group_id: 'g1',
    title: 'Momento',
    image_path: null,
    created_at: '2026-01-01T00:00:00Z',
    deadline_at: null,
    is_challenge: false,
    place_lat: null,
    place_lng: null,
    ...overrides,
  } as ChallengeForPlay
}

describe('resolveTripInviteCover — cascada de portada de la invitación (#617, #619)', () => {
  beforeEach(() => {
    getGroupMock.mockReset()
    getGroupChallengesMock.mockReset()
    getAnswersMock.mockReset()
    resolvePlaceCoverMock.mockReset()
    storagePathToDataUrlMock.mockReset()
    urlToDataUrlMock.mockReset()
  })

  test('1) portada explícita del viaje: no consulta ni momentos ni lugar', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: 'g1/portada.jpg' })
    storagePathToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,portada')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,portada')
    expect(storagePathToDataUrlMock).toHaveBeenCalledWith('g1/portada.jpg')
    expect(getGroupChallengesMock).not.toHaveBeenCalled()
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test('2) sin portada propia: cae a la foto del momento VISIBLE más reciente (criterio de la home)', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    getGroupChallengesMock.mockResolvedValue([
      moment({ id: 'm1', place_lat: 40.4, place_lng: -3.7, image_path: 'momento.jpg' }),
    ])
    getAnswersMock.mockResolvedValue(new Map())
    storagePathToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,momento')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,momento')
    expect(storagePathToDataUrlMock).toHaveBeenCalledWith('momento.jpg')
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test(
    'la portada del share = la portada de la home (mismo fixture): gana el momento ' +
      'situado, no el reto con foto distinta',
    async () => {
      // Fixture compartido: un reto CERRADO pero SIN respuesta aún visible (RLS) con
      // una foto DISTINTA y más reciente, y un recuerdo SITUADO más antiguo. Antes de
      // #619 `tripInviteCover` habría mostrado la foto del reto (el último con imagen,
      // sin filtrar por "visible"); la home nunca lo hizo (no aporta punto: anti-spoiler).
      const fixture: ChallengeForPlay[] = [
        moment({
          id: 'c-reto',
          title: 'Reto de la playa',
          is_challenge: true,
          deadline_at: '2020-01-01T00:00:00Z', // cerrado
          image_path: 'reto-cerrado.jpg',
          created_at: '2026-07-02T10:00:00Z', // más reciente
        }),
        moment({
          id: 'c-recuerdo',
          title: 'Atardecer en la playa',
          is_challenge: false,
          place_lat: 36.5,
          place_lng: -6.3,
          image_path: 'momento-situado.jpg',
          created_at: '2026-07-01T10:00:00Z', // más antiguo, pero SÍ visible
        }),
      ]
      getGroupMock.mockResolvedValue({ cover_image_path: null })
      getGroupChallengesMock.mockResolvedValue(fixture)
      getAnswersMock.mockResolvedValue(new Map()) // la respuesta del reto aún no es visible
      storagePathToDataUrlMock.mockImplementation(async (path: string) => `data:cover/${path}`)

      // Lo que resolvería la HOME con el mismo criterio canónico (sin mockear lib/tripCover).
      const homeMoments = await resolveVisibleTripMoments('g1')
      const homeCoverPath = pickTripCoverImagePath(homeMoments)
      expect(homeCoverPath).toBe('momento-situado.jpg')

      const result = await resolveTripInviteCover('g1', 'Viaje a Cádiz')

      expect(result).toBe(`data:cover/${homeCoverPath}`)
      expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
    },
  )

  test('3) sin portada ni momento visible: cae a la derivada del LUGAR', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    getGroupChallengesMock.mockResolvedValue([])
    resolvePlaceCoverMock.mockResolvedValue({
      imageUrl: 'https://wikimedia/japon.jpg',
      pageUrl: null,
      title: 'Japón',
    })
    urlToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,japon')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,japon')
    expect(resolvePlaceCoverMock).toHaveBeenCalledWith('Japón en primavera')
  })

  test('4) nada resuelve en ningún nivel: null (la tarjeta cae al mapa nocturno de marca)', async () => {
    getGroupMock.mockResolvedValue(null)
    getGroupChallengesMock.mockResolvedValue([])
    resolvePlaceCoverMock.mockResolvedValue({ imageUrl: null, pageUrl: null, title: null })

    const result = await resolveTripInviteCover('g1', 'Sin nombre')

    expect(result).toBeNull()
  })

  test('getGroup lanza (best-effort): no rompe, sigue al momento visible', async () => {
    getGroupMock.mockRejectedValue(new Error('network'))
    getGroupChallengesMock.mockResolvedValue([
      moment({ id: 'm1', place_lat: 40.4, place_lng: -3.7, image_path: 'momento.jpg' }),
    ])
    getAnswersMock.mockResolvedValue(new Map())
    storagePathToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,momento')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,momento')
  })

  test('resolveVisibleTripMoments lanza (best-effort): no rompe, sigue al lugar', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    getGroupChallengesMock.mockRejectedValue(new Error('network'))
    resolvePlaceCoverMock.mockResolvedValue({
      imageUrl: 'https://wikimedia/japon.jpg',
      pageUrl: null,
      title: 'Japón',
    })
    urlToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,japon')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,japon')
  })
})
