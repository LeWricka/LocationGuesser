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

  test('los contextos nuevos también se ven una sola vez', () => {
    const contexts = ['welcome', 'create-trip', 'add-moment', 'create-challenge'] as const
    for (const context of contexts) {
      const first = renderHook(() => useOnboarding(context, 'u1'))
      expect(first.result.current.shouldShow).toBe(true)
      act(() => first.result.current.markSeen())

      const again = renderHook(() => useOnboarding(context, 'u1'))
      expect(again.result.current.shouldShow).toBe(false)
    }
  })
})

// Issue #625: "los tutoriales saltan CADA login". Estos dos casos son el
// contrato explícito que pidió el dueño: el MISMO usuario no lo vuelve a ver al
// cerrar y volver a entrar sesión (simulado como dos montajes con el mismo
// user.id, igual que un logout/login real no cambia el id de una cuenta
// permanente); un usuario NUEVO en el mismo navegador sí lo ve.
describe('useOnboarding — persistencia por usuario (#625)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('no vuelve a mostrarse tras un logout/login del mismo usuario', () => {
    const before = renderHook(() => useOnboarding('group', 'user-123'))
    act(() => before.result.current.markSeen())
    before.unmount()

    // "Login": nuevo montaje del árbol de React con el MISMO user.id (una cuenta
    // permanente conserva su id entre sesiones; ver diagnóstico en onboardingFlags.ts).
    const after = renderHook(() => useOnboarding('group', 'user-123'))
    expect(after.result.current.shouldShow).toBe(false)
  })

  test('sí se muestra para un usuario nuevo en el mismo navegador', () => {
    const owner = renderHook(() => useOnboarding('group', 'user-123'))
    act(() => owner.result.current.markSeen())
    owner.unmount()

    const guest = renderHook(() => useOnboarding('group', 'user-456'))
    expect(guest.result.current.shouldShow).toBe(true)
  })
})

// Arreglo de RAÍZ (issue #717): el perfil de la cuenta (no solo el localStorage
// de este navegador) es la fuente de la verdad cuando hay sesión.
describe('useOnboarding — arreglo de raíz por perfil (#717)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('perfil visto + storage vacío del navegador → NO se muestra', () => {
    const { result } = renderHook(() =>
      useOnboarding('group', 'u1', { group: '2026-07-01T00:00:00.000Z' }),
    )
    expect(result.current.shouldShow).toBe(false)
  })

  test('perfil limpio ({}) → se muestra UNA vez y persiste', () => {
    const { result } = renderHook(() => useOnboarding('group', 'u1', {}))
    expect(result.current.shouldShow).toBe(true)

    act(() => result.current.markSeen())
    expect(result.current.shouldShow).toBe(false)

    // Nuevo montaje: aunque el perfil (pasado por prop) SIGA sin la clave — p.ej.
    // el refresco de perfil desde servidor todavía no ha llegado — la caché
    // local YA cubre el "visto" y no vuelve a aparecer (issue #625: sin esto,
    // reaparecería mientras el perfil no se recargase).
    const again = renderHook(() => useOnboarding('group', 'u1', {}))
    expect(again.result.current.shouldShow).toBe(false)
  })
})
