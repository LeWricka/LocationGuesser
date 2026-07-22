import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

let votes: { user_id: string }[] = []

// Espía (no solo stub): el viaje de EJEMPLO (id centinela, onboarding nuevo
// pieza 4/4) debe cortar ANTES de pedir los votos — ver el test dedicado.
const getGroupVotesSpy = vi.fn(async () => votes)
vi.mock('../../lib/leaderboard', () => ({
  getGroupVotes: () => getGroupVotesSpy(),
}))

import { useGuestRegisterPrompt } from './useGuestRegisterPrompt'
import { EXAMPLE_TRIP_GROUP_ID } from '../../lib/exampleTrip'

describe('useGuestRegisterPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    votes = []
    getGroupVotesSpy.mockClear()
  })

  // Viaje de EJEMPLO (onboarding nuevo, pieza 4/4): id CENTINELA — solo lectura
  // en memoria, sin votos reales que consultar. Con `isAnonymous: true` (la
  // única condición que dispararía la consulta) debe cortar igual.
  test('viaje de EJEMPLO (id centinela): nunca pega a Supabase, ni con sesión anónima', async () => {
    const { result } = renderHook(() =>
      useGuestRegisterPrompt(EXAMPLE_TRIP_GROUP_ID, 'guest-1', true),
    )
    await waitFor(() => expect(result.current.show).toBe(false))
    expect(getGroupVotesSpy).not.toHaveBeenCalled()
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
