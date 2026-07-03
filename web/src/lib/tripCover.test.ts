import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ChallengeForPlay } from './challenges'
import type { LatLng } from './geo'

// Mockeamos solo `getGroupChallenges` (pega a Supabase); `splitByStatus`/`isLive` son
// puras y las dejamos reales (importOriginal), mismo patrón que useTripData.test.ts.
const getGroupChallengesMock = vi.fn<(groupId: string) => Promise<ChallengeForPlay[]>>()
vi.mock('./groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./groupData')>()
  return { ...actual, getGroupChallenges: (groupId: string) => getGroupChallengesMock(groupId) }
})

const getAnswersMock = vi.fn<(ids: string[]) => Promise<Map<string, LatLng>>>()
vi.mock('./challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./challenges')>()
  return { ...actual, getAnswers: (ids: string[]) => getAnswersMock(ids) }
})

import { resolveVisibleTripMoments, pickTripCoverImagePath, isValidLatLng } from './tripCover'

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

describe('resolveVisibleTripMoments — criterio CANÓNICO compartido home/invitación (#619)', () => {
  beforeEach(() => {
    getGroupChallengesMock.mockReset()
    getAnswersMock.mockReset()
  })

  test('recuerdo con lugar visible cuenta como momento', async () => {
    getGroupChallengesMock.mockResolvedValue([
      moment({ id: 'm1', place_lat: 40.4, place_lng: -3.7, image_path: 'playa.jpg' }),
    ])
    getAnswersMock.mockResolvedValue(new Map())

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([
      {
        id: 'm1',
        title: 'Momento',
        image_path: 'playa.jpg',
        created_at: '2026-01-01T00:00:00Z',
        lat: 40.4,
        lng: -3.7,
      },
    ])
  })

  test('reto CERRADO con respuesta visible cuenta como momento', async () => {
    getGroupChallengesMock.mockResolvedValue([
      moment({
        id: 'c1',
        is_challenge: true,
        deadline_at: '2020-01-01T00:00:00Z',
        image_path: 'reto.jpg',
      }),
    ])
    getAnswersMock.mockResolvedValue(new Map([['c1', { lat: 10, lng: 20 }]]))

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([
      {
        id: 'c1',
        title: 'Momento',
        image_path: 'reto.jpg',
        created_at: '2026-01-01T00:00:00Z',
        lat: 10,
        lng: 20,
      },
    ])
  })

  test('ANTI-SPOILER: reto ABIERTO nunca aporta momento, aunque tenga foto', async () => {
    getGroupChallengesMock.mockResolvedValue([
      moment({
        id: 'c1',
        is_challenge: true,
        deadline_at: '2999-01-01T00:00:00Z',
        image_path: 'reto-abierto.jpg',
      }),
    ])
    getAnswersMock.mockResolvedValue(new Map())

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([])
    // Un reto en vivo nunca pasa por `getAnswers`: `splitByStatus` lo aparta y,
    // sin momentos cerrados, se retorna antes de consultar respuestas.
    expect(getAnswersMock).not.toHaveBeenCalled()
  })

  test('reto CERRADO sin respuesta aún visible (RLS): no cuenta, aunque tenga foto', async () => {
    getGroupChallengesMock.mockResolvedValue([
      moment({
        id: 'c1',
        is_challenge: true,
        deadline_at: '2020-01-01T00:00:00Z',
        image_path: 'reto.jpg',
      }),
    ])
    getAnswersMock.mockResolvedValue(new Map()) // RLS aún no sirve la respuesta

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([])
  })

  test('recuerdo SIN lugar (aún no situado): no cuenta', async () => {
    getGroupChallengesMock.mockResolvedValue([moment({ id: 'm1', image_path: 'foto.jpg' })])
    getAnswersMock.mockResolvedValue(new Map())

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([])
  })

  test('sin retos: lista vacía, no consulta respuestas', async () => {
    getGroupChallengesMock.mockResolvedValue([])

    const moments = await resolveVisibleTripMoments('g1')

    expect(moments).toEqual([])
    expect(getAnswersMock).not.toHaveBeenCalled()
  })
})

describe('pickTripCoverImagePath — portada canónica a partir de los momentos visibles', () => {
  test('el primero (más reciente) CON foto gana, aunque uno más antiguo también tenga', () => {
    const path = pickTripCoverImagePath([
      { image_path: 'reciente.jpg' },
      { image_path: 'antiguo.jpg' },
    ])
    expect(path).toBe('reciente.jpg')
  })

  test('si el más reciente no tiene foto pero otro sí, gana el que SÍ tiene foto', () => {
    const path = pickTripCoverImagePath([{ image_path: null }, { image_path: 'antiguo.jpg' }])
    expect(path).toBe('antiguo.jpg')
  })

  test('si ninguno tiene foto, cae al del momento más reciente (null)', () => {
    const path = pickTripCoverImagePath([{ image_path: null }, { image_path: null }])
    expect(path).toBeNull()
  })

  test('sin momentos: null', () => {
    expect(pickTripCoverImagePath([])).toBeNull()
  })
})

describe('isValidLatLng — guarda de rangos (ver useWorldTrips.test.ts para la cobertura completa)', () => {
  test('acepta coordenadas reales y rechaza fuera de rango', () => {
    expect(isValidLatLng(40.4, -3.7)).toBe(true)
    expect(isValidLatLng(135.7, 35.0)).toBe(false)
  })
})
