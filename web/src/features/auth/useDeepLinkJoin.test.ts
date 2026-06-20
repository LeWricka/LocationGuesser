import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// membership.ts importa ./supabase; mockeamos joinGroup (lo único que usa el hook).
const joinGroup = vi.fn<(groupId: string, userId: string) => Promise<void>>(async () => {})
vi.mock('../../lib/membership', () => ({
  joinGroup: (groupId: string, userId: string) => joinGroup(groupId, userId),
}))

import { useDeepLinkJoin } from './useDeepLinkJoin'

beforeEach(() => {
  joinGroup.mockClear()
  window.location.hash = ''
})

describe('useDeepLinkJoin', () => {
  test('destino de grupo: hace join y restaura el hash', async () => {
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC&c=uuid-1')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&c=uuid-1')
  })

  test('destino de grupo sin reto: join y hash solo con grupo', async () => {
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC')
  })

  test('destino no-grupo: no hace join y va a la home (hash vacío)', async () => {
    window.location.hash = '#perfil'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#perfil')
    expect(joinGroup).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  test('sin userId: no hace join aunque el destino sea de grupo', async () => {
    const { result } = renderHook(() => useDeepLinkJoin(undefined))
    await result.current('#g=ABC')
    expect(joinGroup).not.toHaveBeenCalled()
  })
})
