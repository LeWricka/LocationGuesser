import { beforeEach, describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnboarding } from './useOnboarding'

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('la primera vez se muestra', () => {
    const { result } = renderHook(() => useOnboarding('group', 'u1'))
    expect(result.current.shouldShow).toBe(true)
  })

  test('markSeen lo oculta y no vuelve a mostrarse en un nuevo montaje', () => {
    const { result } = renderHook(() => useOnboarding('group', 'u1'))
    act(() => result.current.markSeen())
    expect(result.current.shouldShow).toBe(false)

    // Un nuevo montaje (p. ej. otra visita) ya no lo muestra.
    const again = renderHook(() => useOnboarding('group', 'u1'))
    expect(again.result.current.shouldShow).toBe(false)
  })

  test('skip también lo marca como visto', () => {
    const { result } = renderHook(() => useOnboarding('challenge', 'u1'))
    act(() => result.current.skip())
    expect(result.current.shouldShow).toBe(false)

    const again = renderHook(() => useOnboarding('challenge', 'u1'))
    expect(again.result.current.shouldShow).toBe(false)
  })

  test('cada contexto es independiente', () => {
    const group = renderHook(() => useOnboarding('group', 'u1'))
    act(() => group.result.current.markSeen())

    const challenge = renderHook(() => useOnboarding('challenge', 'u1'))
    expect(challenge.result.current.shouldShow).toBe(true)
  })

  test('cada usuario es independiente', () => {
    const u1 = renderHook(() => useOnboarding('group', 'u1'))
    act(() => u1.result.current.markSeen())

    const u2 = renderHook(() => useOnboarding('group', 'u2'))
    expect(u2.result.current.shouldShow).toBe(true)
  })
})
