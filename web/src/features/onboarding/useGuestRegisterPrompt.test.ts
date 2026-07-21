import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

let votes: { user_id: string }[] = []

vi.mock('../../lib/leaderboard', () => ({
  getGroupVotes: async () => votes,
}))

import { useGuestRegisterPrompt } from './useGuestRegisterPrompt'

describe('useGuestRegisterPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    votes = []
  })

  test('no muestra a quien tiene cuenta permanente (no anónimo), aunque haya jugado', async () => {
    votes = [{ user_id: 'guest-1' }]
    const { result } = renderHook(() => useGuestRegisterPrompt('g1', 'guest-1', false))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('NUNCA antes de jugar: anónimo sin votos en el viaje no lo ve', async () => {
    votes = []
    const { result } = renderHook(() => useGuestRegisterPrompt('g1', 'guest-1', true))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('tras jugar (voto propio en el viaje), el anónimo SÍ lo ve', async () => {
    votes = [{ user_id: 'guest-1' }, { user_id: 'otro' }]
    const { result } = renderHook(() => useGuestRegisterPrompt('g1', 'guest-1', true))
    await waitFor(() => expect(result.current.show).toBe(true))
  })

  test('markSeen lo oculta y no vuelve a mostrarse en un nuevo montaje', async () => {
    votes = [{ user_id: 'guest-1' }]
    const { result } = renderHook(() => useGuestRegisterPrompt('g1', 'guest-1', true))
    await waitFor(() => expect(result.current.show).toBe(true))

    act(() => result.current.markSeen())
    expect(result.current.show).toBe(false)

    const again = renderHook(() => useGuestRegisterPrompt('g1', 'guest-1', true))
    await waitFor(() => expect(again.result.current.show).toBe(false))
  })
})
