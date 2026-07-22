import { beforeEach, describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCreadorOnboarding } from './useCreadorOnboarding'

describe('useCreadorOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('no es dueño → nunca hay paso que mostrar', () => {
    const { result } = renderHook(() => useCreadorOnboarding('u1', null, false, 0, false))
    expect(result.current.stage).toBeNull()
  })

  test('dueño, viaje recién creado (0 momentos), primera vez → intro', () => {
    const { result } = renderHook(() => useCreadorOnboarding('u1', null, true, 0, false))
    expect(result.current.stage).toBe('intro')
  })

  test('tras "Empezar" (dismissIntro), con 0 momentos → coach-mark sobre el "+"', () => {
    const { result, rerender } = renderHook(
      ({ moments }: { moments: number }) => useCreadorOnboarding('u1', null, true, moments, false),
      { initialProps: { moments: 0 } },
    )
    act(() => result.current.dismissIntro())
    expect(result.current.stage).toBe('coach')

    // Se guarda un momento: el coach-mark deja paso a la sugerencia.
    rerender({ moments: 1 })
    expect(result.current.stage).toBe('suggest')
  })

  test('"Saltar guía" apaga el recorrido entero, incluso tras guardar un momento', () => {
    const { result, rerender } = renderHook(
      ({ moments }: { moments: number }) => useCreadorOnboarding('u1', null, true, moments, false),
      { initialProps: { moments: 0 } },
    )
    act(() => result.current.dismissIntro())
    act(() => result.current.skipGuide())
    expect(result.current.stage).toBeNull()

    rerender({ moments: 1 })
    expect(result.current.stage).toBeNull()
  })

  test('sugerencia descartada (× o CTA) y aún sin reto → no hay nada que avisar', () => {
    const { result } = renderHook(() => useCreadorOnboarding('u1', null, true, 1, false))
    act(() => result.current.dismissIntro())
    act(() => result.current.dismissSuggest())
    expect(result.current.stage).toBeNull()
  })

  test('con un reto ya creado y la sugerencia resuelta → aviso de compartir, luego remate', () => {
    const { result, rerender } = renderHook(
      ({ hasChallenge }: { hasChallenge: boolean }) =>
        useCreadorOnboarding('u1', null, true, 1, hasChallenge),
      { initialProps: { hasChallenge: false } },
    )
    act(() => result.current.dismissIntro())
    act(() => result.current.dismissSuggest())
    expect(result.current.stage).toBeNull()

    rerender({ hasChallenge: true })
    expect(result.current.stage).toBe('share')

    act(() => result.current.dismissShare())
    expect(result.current.stage).toBe('remate')

    act(() => result.current.dismissRemate())
    expect(result.current.stage).toBeNull()
  })

  test('recorrido completo (o "Saltar guía") persiste: un nuevo montaje ya no ve nada', () => {
    const first = renderHook(() => useCreadorOnboarding('u1', null, true, 1, true))
    act(() => first.result.current.dismissIntro())
    act(() => first.result.current.dismissSuggest())
    act(() => first.result.current.dismissShare())
    act(() => first.result.current.dismissRemate())
    first.unmount()

    // Otro viaje del MISMO usuario (o el mismo tras recargar): ya aprendió.
    const again = renderHook(() => useCreadorOnboarding('u1', null, true, 0, false))
    expect(again.result.current.stage).toBeNull()
  })

  test('cada usuario es independiente', () => {
    const owner1 = renderHook(() => useCreadorOnboarding('u1', null, true, 0, false))
    act(() => owner1.result.current.dismissIntro())
    act(() => owner1.result.current.skipGuide())
    owner1.unmount()

    const owner2 = renderHook(() => useCreadorOnboarding('u2', null, true, 0, false))
    expect(owner2.result.current.stage).toBe('intro')
  })
})
