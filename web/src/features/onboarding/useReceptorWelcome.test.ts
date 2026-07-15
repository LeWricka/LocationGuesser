import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// `created_by` del grupo, configurable por test: decide si el usuario es el dueño.
let createdBy: string | null = 'owner-1'
// Premios del grupo (issue #752), configurable por test.
let groupPrizes: Record<string, string> | null = null

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { created_by: createdBy } }) }),
      }),
    }),
  },
}))

vi.mock('../../lib/groupData', () => ({
  getGroup: async () => ({ id: 'g1', name: 'Japón 2026', prizes: groupPrizes }),
}))

import { useReceptorWelcome } from './useReceptorWelcome'

describe('useReceptorWelcome', () => {
  beforeEach(() => {
    createdBy = 'owner-1'
    groupPrizes = null
  })

  test('no muestra sin grupo o sin usuario', async () => {
    const { result } = renderHook(() => useReceptorWelcome(undefined, undefined))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('al dueño del viaje NO le saluda', async () => {
    createdBy = 'me'
    const { result } = renderHook(() => useReceptorWelcome('g1', 'me'))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('a un receptor (no dueño) le muestra el saludo con el nombre del viaje', async () => {
    createdBy = 'owner-1'
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.tripName).toBe('Japón 2026')
  })

  test('issue #752: resume los premios del viaje para el saludo del receptor', async () => {
    createdBy = 'owner-1'
    groupPrizes = { first: 'manda', last: 'invita' }
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.prizesSummary).toBe('1º manda  ·  Último invita')
  })

  test('sin premios definidos, prizesSummary queda undefined', async () => {
    createdBy = 'owner-1'
    groupPrizes = null
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.prizesSummary).toBeUndefined()
  })
})
