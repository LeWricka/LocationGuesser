import { describe, test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ChallengeForPlay } from '../../lib/challenges'
import { useOwnChallengeGuard } from './useOwnChallengeGuard'

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
  created_by: 'u-other',
  created_at: '2026-06-19T10:00:00.000Z',
}

describe('useOwnChallengeGuard', () => {
  test('reto ajeno: checkOwn resuelve false y no llama a fetchVotes', async () => {
    const fetchVotes = vi.fn()
    const { result } = renderHook(() => useOwnChallengeGuard(fetchVotes))

    let isOwn = true
    await act(async () => {
      isOwn = await result.current.checkOwn(baseChallenge, 'u-me')
    })

    expect(isOwn).toBe(false)
    expect(fetchVotes).not.toHaveBeenCalled()
    expect(result.current.ownVoteCount).toBeNull()
  })

  test('sin sesión: checkOwn resuelve false (no hay userId con quien comparar)', async () => {
    const fetchVotes = vi.fn()
    const { result } = renderHook(() => useOwnChallengeGuard(fetchVotes))

    let isOwn = true
    await act(async () => {
      isOwn = await result.current.checkOwn({ ...baseChallenge, created_by: 'u-me' }, undefined)
    })

    expect(isOwn).toBe(false)
    expect(fetchVotes).not.toHaveBeenCalled()
  })

  test('reto propio: checkOwn resuelve true y deja el recuento de votos', async () => {
    const fetchVotes = vi.fn().mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
    const { result } = renderHook(() => useOwnChallengeGuard(fetchVotes))
    const ownChallenge = { ...baseChallenge, created_by: 'u-me' }

    let isOwn = false
    await act(async () => {
      isOwn = await result.current.checkOwn(ownChallenge, 'u-me')
    })

    expect(isOwn).toBe(true)
    expect(fetchVotes).toHaveBeenCalledWith('c1')
    expect(result.current.ownVoteCount).toBe(2)
  })

  test('reto propio pero fetchVotes falla: sigue cortando (true), sin recuento', async () => {
    const fetchVotes = vi.fn().mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useOwnChallengeGuard(fetchVotes))
    const ownChallenge = { ...baseChallenge, created_by: 'u-me' }

    let isOwn = false
    await act(async () => {
      isOwn = await result.current.checkOwn(ownChallenge, 'u-me')
    })

    expect(isOwn).toBe(true)
    expect(result.current.ownVoteCount).toBeNull()
  })

  test('respeta isCancelled: no fija el recuento si la carrera ya se canceló', async () => {
    const fetchVotes = vi.fn().mockResolvedValue([{ id: 'v1' }])
    const { result } = renderHook(() => useOwnChallengeGuard(fetchVotes))
    const ownChallenge = { ...baseChallenge, created_by: 'u-me' }

    await act(async () => {
      await result.current.checkOwn(ownChallenge, 'u-me', { isCancelled: () => true })
    })

    expect(result.current.ownVoteCount).toBeNull()
  })
})
