import { beforeEach, describe, expect, test } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRetoShareOnboarding } from './useRetoShareOnboarding'

describe('useRetoShareOnboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('anónimo, con viaje, primera vez → aplica', () => {
    const { result } = renderHook(() => useRetoShareOnboarding('g1', 'u1', true))
    expect(result.current.active).toBe(true)
  })

  test('sin sesión anónima (cuenta permanente) → no aplica', () => {
    const { result } = renderHook(() => useRetoShareOnboarding('g1', 'u1', false))
    expect(result.current.active).toBe(false)
  })

  test('sin viaje (reto de práctica suelto, sin groupId) → no aplica', () => {
    const { result } = renderHook(() => useRetoShareOnboarding(undefined, 'u1', true))
    expect(result.current.active).toBe(false)
  })

  test('ya visto (reto_share) → no vuelve a aplicar', () => {
    const first = renderHook(() => useRetoShareOnboarding('g1', 'u1', true))
    expect(first.result.current.active).toBe(true)
    first.unmount()

    const again = renderHook(() => useRetoShareOnboarding('g1', 'u1', true))
    expect(again.result.current.active).toBe(false)
  })

  // Quien ya vivió la bienvenida del INVITADO (ReceptorWelcomeGate, al entrar
  // primero por el enlace del viaje entero) no necesita que se le vuelva a
  // explicar Momentu al abrir un reto suelto de ESE mismo viaje.
  test('perfil con `welcome` ya visto → no aplica (ya conoce Momentu)', () => {
    const { result } = renderHook(() =>
      useRetoShareOnboarding('g1', 'u1', true, { welcome: '2026-07-01T00:00:00.000Z' }),
    )
    expect(result.current.active).toBe(false)
  })

  test('perfil con `group` ya visto → no aplica (mismo criterio legado)', () => {
    const { result } = renderHook(() =>
      useRetoShareOnboarding('g1', 'u1', true, { group: '2026-07-01T00:00:00.000Z' }),
    )
    expect(result.current.active).toBe(false)
  })

  test('cada usuario es independiente', () => {
    const owner = renderHook(() => useRetoShareOnboarding('g1', 'u1', true))
    expect(owner.result.current.active).toBe(true)
    owner.unmount()

    const guest = renderHook(() => useRetoShareOnboarding('g1', 'u2', true))
    expect(guest.result.current.active).toBe(true)
  })
})
