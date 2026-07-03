import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ChallengeForPlay } from '../../lib/challenges'
import type { GroupInfo } from '../../lib/groupData'
import type { VoteWithName } from '../../lib/leaderboard'

// Issue #578: `useTripData` deriva `isOwn` (created_by === myUserId) para que la
// tarjeta del reto NUNCA ofrezca "Adivina →" sobre un reto propio. Mockeamos solo
// las funciones que pegan a Supabase (importOriginal conserva `isLive`/`splitByStatus`,
// puras, igual patrón que HomePage.test.tsx) para no montar la BD real.
const getGroupMock = vi.fn<(groupId: string) => Promise<GroupInfo | null>>()
const getGroupChallengesMock = vi.fn<(groupId: string) => Promise<ChallengeForPlay[]>>()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return {
    ...actual,
    getGroup: (groupId: string) => getGroupMock(groupId),
    getGroupChallenges: (groupId: string) => getGroupChallengesMock(groupId),
  }
})

const getGroupVotesMock = vi.fn<(groupId: string) => Promise<VoteWithName[]>>()
vi.mock('../../lib/leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/leaderboard')>()
  return { ...actual, getGroupVotes: (groupId: string) => getGroupVotesMock(groupId) }
})

// La suscripción Realtime no aporta nada al test: un canal inerte, igual patrón
// que HomePage.test.tsx.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => {
      const ch: Record<string, unknown> = {}
      ch.on = () => ch
      ch.subscribe = () => ch
      return ch
    },
    removeChannel: vi.fn(),
  },
}))

import { useTripData } from './useTripData'

function activeChallenge(overrides: Partial<ChallengeForPlay>): ChallengeForPlay {
  return {
    id: 'c1',
    group_id: 'g1',
    title: 'Reto activo',
    description: null,
    is_challenge: true,
    place_lat: null,
    place_lng: null,
    image_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    sv_lock_move: false,
    sv_lock_rotate: false,
    guess_seconds: null,
    // Bien en el futuro: el reto sigue EN JUEGO (isLive → true).
    deadline_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    photo_is_hint: true,
    score_scale: 'mundo',
    challenge_kind: 'location',
    number_question: null,
    number_unit: null,
    number_decimals: 0,
    number_tolerance: 'normal',
    created_by: 'u-owner',
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  } as unknown as ChallengeForPlay
}

beforeEach(() => {
  vi.clearAllMocks()
  getGroupMock.mockResolvedValue({
    id: 'g1',
    name: 'Viaje',
    prizes: null,
    closed_at: null,
    starts_on: null,
    ends_on: null,
    description: null,
    companions: null,
    cover_image_path: null,
  })
  getGroupVotesMock.mockResolvedValue([])
})

describe('useTripData — isOwn (issue #578)', () => {
  test('reto creado por mí: isOwn = true', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-me' })])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(true)
  })

  test('reto creado por otro miembro: isOwn = false', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-otro' })])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(false)
  })

  test('sin sesión (myUserId null): nunca es propio', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-otro' })])

    const { result } = renderHook(() => useTripData('g1', null))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(false)
  })
})
