import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// membership.ts importa ./supabase; mockeamos lo que usa el hook (join + isMember).
const joinGroup = vi.fn<(groupId: string, userId: string) => Promise<void>>(async () => {})
const isMember = vi.fn<(groupId: string, userId: string) => Promise<boolean>>(async () => false)
vi.mock('../../lib/membership', () => ({
  joinGroup: (groupId: string, userId: string) => joinGroup(groupId, userId),
  isMember: (groupId: string, userId: string) => isMember(groupId, userId),
}))

// analytics importa mixpanel-browser; mockeamos track para inspeccionar el evento.
const track = vi.fn<(event: string, props?: Record<string, unknown>) => void>()
vi.mock('../../lib/analytics', () => ({
  track: (event: string, props?: Record<string, unknown>) => track(event, props),
}))

import { useDeepLinkJoin } from './useDeepLinkJoin'

beforeEach(() => {
  joinGroup.mockClear()
  isMember.mockClear()
  isMember.mockResolvedValue(false)
  track.mockClear()
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

  test('alta real (no era miembro): trackea group_joined', async () => {
    isMember.mockResolvedValue(false)
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(track).toHaveBeenCalledWith('group_joined', { group_id: 'ABC' })
  })

  test('reentrada (ya era miembro): no trackea group_joined', async () => {
    isMember.mockResolvedValue(true)
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(track).not.toHaveBeenCalled()
  })

  // Regresión #556: App.tsx llama joinIfGroup(window.location.hash) en cada
  // remontaje/recarga mientras haya `route.group && user?.id` (Flujo C). Si el
  // hash actual trae `add=reto` (o `add=recuerdo`, `v=marcador`, `from=…`), un F5,
  // la recarga del Service Worker o volver de segundo plano NO debe perder esos
  // parámetros: antes se reescribía a `#g=…(&c=…)` a secas y el router te sacaba
  // del formulario a medio rellenar.
  test('regresión #556: hash con add=reto sobrevive a un remontaje/joinIfGroup', async () => {
    window.location.hash = '#g=ABC&add=reto'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&add=reto')
  })

  test('regresión #556: hash con add=recuerdo y v=marcador también sobrevive', async () => {
    window.location.hash = '#g=ABC&v=marcador'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(window.location.hash).toBe('#g=ABC&v=marcador')
  })

  test('regresión #556: reto nacido de un recuerdo (from) sobrevive al remontaje', async () => {
    window.location.hash = '#g=ABC&add=reto&from=momento-1'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(window.location.hash).toBe('#g=ABC&add=reto&from=momento-1')
  })

  test('restaurar destino guardado (Flujo A/B) con add=reto: se aplica el hash completo', async () => {
    // window.location.hash arranca distinto (p.ej. la home tras volver del email);
    // el destino guardado por setNextDestination SÍ debe aplicarse tal cual.
    window.location.hash = ''
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC&add=reto&from=momento-1')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&add=reto&from=momento-1')
  })
})
