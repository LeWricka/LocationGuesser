import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useOverlayBack } from './useOverlayBack'

// Política "atrás cierra la capa de encima" (issue #967). En jsdom `pushState`
// es real (fija `history.state`), pero `history.back()` navegaría de verdad
// (async, ruidoso): lo espiamos para que sea un no-op determinista, y simulamos
// el atrás del navegador disparando `popstate` a mano — que es exactamente lo
// que hace el botón atrás / swipe-back en un navegador real.

beforeEach(() => {
  // Historial limpio: sin la marca de una prueba anterior.
  window.history.replaceState(null, '', window.location.href)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOverlayBack', () => {
  test('al abrir empuja una entrada-centinela en el historial (mismo hash)', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const hashBefore = window.location.hash

    renderHook(({ open }) => useOverlayBack(open, () => {}), {
      initialProps: { open: true },
    })

    expect(pushSpy).toHaveBeenCalledTimes(1)
    // La marca viaja en el state; la URL (hash) NO cambia → sin `hashchange`.
    const [state] = pushSpy.mock.calls[0]
    expect(state).toMatchObject({ lgOverlayBack: true })
    expect(window.location.hash).toBe(hashBefore)
  })

  test('el atrás del navegador (popstate) cierra la capa de encima', () => {
    const close = vi.fn()
    renderHook(({ open }) => useOverlayBack(open, close), {
      initialProps: { open: true },
    })

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(close).toHaveBeenCalledTimes(1)
  })

  test('cerrar por UI (open→false) deshace la entrada con history.back', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const { rerender } = renderHook(({ open }) => useOverlayBack(open, () => {}), {
      initialProps: { open: true },
    })
    // La apertura real dejó `lgOverlayBack` en el state (pushState de jsdom).
    expect(window.history.state).toMatchObject({ lgOverlayBack: true })

    rerender({ open: false })

    // Al cerrarse sin pasar por el atrás, deshace su propia entrada.
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  test('tras cerrar por atrás NO vuelve a llamar history.back (no doble-consumo)', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const close = vi.fn()

    const { rerender } = renderHook(({ open }) => useOverlayBack(open, close), {
      initialProps: { open: true },
    })

    // Atrás del navegador → cierra la capa…
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(1)

    // …y el padre baja `open`: la limpieza NO debe consumir otra entrada, porque
    // el navegador ya consumió la nuestra al hacer el atrás.
    rerender({ open: false })
    expect(backSpy).not.toHaveBeenCalled()
  })

  test('cerrar y reabrir en el mismo gesto no toca el historial (una sola entrada)', () => {
    // Modela "menú → ajustes": `open` nunca pasa por `false`, así que el efecto
    // no se re-ejecuta y no hay carrera pushState/back. Con `open` estable en
    // `true`, no debe empujarse una segunda entrada.
    const pushSpy = vi.spyOn(window.history, 'pushState')

    const { rerender } = renderHook(({ open, close }) => useOverlayBack(open, close), {
      initialProps: { open: true, close: () => {} },
    })
    // Cambia solo el callback (otra capa toma el relevo), `open` sigue true.
    rerender({ open: true, close: () => {} })

    expect(pushSpy).toHaveBeenCalledTimes(1)
  })
})
