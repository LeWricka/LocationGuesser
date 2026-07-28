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

  // ── Profundidad: capas anidadas (issue #972.2) ──────────────────────────────
  // Caso real: un Lightbox abierto SOBRE una hoja (MomentSheet). `depth` cuenta
  // las capas apiladas; cada atrás cierra la de encima y re-empuja la centinela
  // mientras queden capas por debajo.

  test('con profundidad, el atrás cierra capa a capa y re-empuja mientras queden', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const close = vi.fn()

    // Dos capas abiertas (hoja + lightbox encima).
    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, close), {
      initialProps: { depth: 2 },
    })
    // Una sola centinela, aunque haya dos capas.
    expect(pushSpy).toHaveBeenCalledTimes(1)

    // 1er atrás: cierra la de encima (lightbox). Como aún queda la hoja
    // (`depth` era 2 en el momento del atrás), RE-EMPUJA la centinela.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledTimes(2)

    // El padre baja `depth` a 1 (la capa de encima ya se cerró).
    rerender({ depth: 1 })

    // 2º atrás: cierra la hoja. Ya no quedan capas → NO re-empuja.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(2)
    expect(pushSpy).toHaveBeenCalledTimes(2)

    // El padre baja `depth` a 0: la capa se cerró por ATRÁS, así que la limpieza
    // NO debe consumir otra entrada (no hay doble-consumo).
    rerender({ depth: 0 })
    expect(backSpy).not.toHaveBeenCalled()
  })

  test('tras cerrar todo por atrás, un adelante (popstate) ya no cierra nada', () => {
    // Adelante coherente (#972.3): al cerrarse la última capa el hook deja de
    // escuchar `popstate`, así que re-navegar a la entrada-fantasma hacia
    // delante no reabre ni cierra nada (se consume sin efecto visible).
    const close = vi.fn()
    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, close), {
      initialProps: { depth: 1 },
    })

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(1)

    // Capa cerrada → sin capas.
    rerender({ depth: 0 })

    // "Adelante" dispara otro popstate: el listener ya no está, no hay efecto.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('cerrar la capa de arriba por UI a profundidad 2 no roba backs', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const close = vi.fn()

    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, close), {
      initialProps: { depth: 2 },
    })
    expect(pushSpy).toHaveBeenCalledTimes(1)

    // El usuario cierra la capa de encima con la ✕ (no con atrás): `depth` baja
    // a 1 sin cruzar `active`. Ni se empuja otra entrada ni se deshace ninguna.
    rerender({ depth: 1 })
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(backSpy).not.toHaveBeenCalled()

    // El atrás siguiente cierra la capa que queda (una sola vez), sin re-empujar.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    rerender({ depth: 0 })
    expect(backSpy).not.toHaveBeenCalled()
  })

  test('cerrar todo por UI a profundidad 2 deshace la única entrada una sola vez', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, () => {}), {
      initialProps: { depth: 2 },
    })

    // Cierra ambas por UI (lightbox y luego hoja): al llegar a 0 se deshace la
    // centinela EXACTAMENTE una vez (no una por capa).
    rerender({ depth: 1 })
    rerender({ depth: 0 })
    expect(backSpy).toHaveBeenCalledTimes(1)
  })
})
