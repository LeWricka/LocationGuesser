import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVisibilityReload, STALE_RELOAD_MS } from './useVisibilityReload'

// Issue #638: la pestaña de una PWA puede quedar viva horas; las URLs firmadas
// (24h) sobreviven de sobra, pero por si acaso —y para no depender solo del
// onerror del preload— re-resolvemos el feed al volver si el dato ya es viejo.
// `document.visibilityState` es de solo lectura en jsdom: lo redefinimos con
// `Object.defineProperty` para simular pestaña oculta/visible en cada test.
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function fireVisibilityChange() {
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useVisibilityReload', () => {
  test('pestaña vuelve a visible con dato reciente: no recarga', () => {
    const reload = vi.fn()
    const now = Date.now()
    renderHook(() => useVisibilityReload(() => now, reload))

    vi.advanceTimersByTime(STALE_RELOAD_MS - 1000)
    fireVisibilityChange()

    expect(reload).not.toHaveBeenCalled()
  })

  test('pestaña vuelve a visible con dato caducado (> staleMs): recarga', () => {
    const reload = vi.fn()
    const now = Date.now()
    renderHook(() => useVisibilityReload(() => now, reload))

    vi.advanceTimersByTime(STALE_RELOAD_MS + 1000)
    fireVisibilityChange()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('la pestaña se oculta y vuelve a mostrar sin pasar el umbral: no recarga', () => {
    const reload = vi.fn()
    const now = Date.now()
    renderHook(() => useVisibilityReload(() => now, reload))

    setVisibility('hidden')
    fireVisibilityChange()
    vi.advanceTimersByTime(1000)
    setVisibility('visible')
    fireVisibilityChange()

    expect(reload).not.toHaveBeenCalled()
  })

  test('sin resolución previa (null): no recarga aunque pase el umbral', () => {
    const reload = vi.fn()
    renderHook(() => useVisibilityReload(() => null, reload))

    vi.advanceTimersByTime(STALE_RELOAD_MS + 1000)
    fireVisibilityChange()

    expect(reload).not.toHaveBeenCalled()
  })

  test('lee el último `reload`/`getLastResolvedAt` sin reenganchar el listener en cada render', () => {
    const reloadA = vi.fn()
    const reloadB = vi.fn()
    let lastResolvedAt = Date.now()
    const { rerender } = renderHook(
      ({ reload }) => useVisibilityReload(() => lastResolvedAt, reload),
      { initialProps: { reload: reloadA } },
    )

    // El dato se refresca (issue real: tras un reload, el timestamp avanza).
    vi.advanceTimersByTime(STALE_RELOAD_MS + 1000)
    lastResolvedAt = Date.now()
    rerender({ reload: reloadB })

    fireVisibilityChange()
    // Sin pasar el umbral tras el "reload": no dispara ninguno de los dos.
    expect(reloadA).not.toHaveBeenCalled()
    expect(reloadB).not.toHaveBeenCalled()

    vi.advanceTimersByTime(STALE_RELOAD_MS + 1000)
    fireVisibilityChange()
    // Ahora sí es viejo: dispara el `reload` VIGENTE (B), no el obsoleto (A).
    expect(reloadA).not.toHaveBeenCalled()
    expect(reloadB).toHaveBeenCalledTimes(1)
  })
})
