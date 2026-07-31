import { act, useState } from 'react'
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { OverlayBackProvider } from './OverlayBackProvider'
import {
  isAtHistoryFloor,
  markHistoryFloor,
  pushOverlaySentinel,
  useOverlayLayer,
} from './overlayBack'
import { useOverlayBack } from './useOverlayBack'

// GUARDA DE SUELO del historial (issue #983). El fallo forense: un `atrás` de
// más provocaba una RECARGA COMPLETA del documento (evento `load`) en vez de
// una navegación SPA. En jsdom `history.back()` no mueve de verdad ni dispara
// `popstate`; por eso montamos un SIMULADOR FIEL de la pila del navegador
// (`FakeHistory`) que:
//   - mantiene una pila de `state`s con un índice actual,
//   - refleja el `state` actual en `window.history.state` (para que el código
//     real —`isAtHistoryFloor`, `useOverlayBack`— lo lea igual que en el
//     navegador),
//   - al hacer `back()` desde el SUELO (índice 0) NO dispara `popstate`: marca
//     `leftDocument = true`, que es exactamente la recarga que perseguimos
//     (el navegador abandona el documento).
// Así podemos afirmar la invariante dura del fix: la lógica de capas NUNCA
// cruza el suelo (`leftDocument` se queda en `false`).

class FakeHistory {
  entries: (Record<string, unknown> | null)[] = [null]
  idx = 0
  leftDocument = false
  backCalls = 0

  private realReplace = window.history.replaceState.bind(window.history)
  private origPush = window.history.pushState
  private origReplace = window.history.replaceState
  private origBack = window.history.back
  private origForward = window.history.forward

  install() {
    // El estado inicial (documento recién cargado) es `null`, como un navegador
    // real tras `page.goto`.
    this.realReplace(null, '')
    window.history.pushState = (s: unknown) => {
      this.entries = this.entries.slice(0, this.idx + 1)
      this.entries.push((s ?? null) as Record<string, unknown> | null)
      this.idx = this.entries.length - 1
      this.realReplace(s, '')
    }
    window.history.replaceState = (s: unknown) => {
      this.entries[this.idx] = (s ?? null) as Record<string, unknown> | null
      this.realReplace(s, '')
    }
    window.history.back = () => {
      this.backCalls += 1
      if (this.idx === 0) {
        // ¡Cruce de suelo! El navegador saldría del documento (recarga).
        this.leftDocument = true
        return
      }
      this.idx -= 1
      this.realReplace(this.entries[this.idx], '')
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.entries[this.idx] }))
    }
    window.history.forward = () => {
      if (this.idx >= this.entries.length - 1) return
      this.idx += 1
      this.realReplace(this.entries[this.idx], '')
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.entries[this.idx] }))
    }
  }

  /** Atrás del navegador/usuario (botón físico, swipe). Igual que `back()`. */
  userBack() {
    act(() => {
      window.history.back()
    })
  }

  uninstall() {
    window.history.pushState = this.origPush
    window.history.replaceState = this.origReplace
    window.history.back = this.origBack
    window.history.forward = this.origForward
    this.realReplace(null, '')
  }
}

let fake: FakeHistory

beforeEach(() => {
  fake = new FakeHistory()
  fake.install()
})

afterEach(() => {
  fake.uninstall()
})

describe('guarda de suelo — primitivas', () => {
  test('markHistoryFloor marca la entrada actual y es idempotente', () => {
    expect(isAtHistoryFloor()).toBe(false)
    markHistoryFloor()
    expect(isAtHistoryFloor()).toBe(true)
    expect(fake.entries[0]).toMatchObject({ lgFloor: true })
    // Idempotente: no crea entradas nuevas.
    markHistoryFloor()
    expect(fake.entries).toHaveLength(1)
  })

  test('pushOverlaySentinel NO hereda la marca de suelo', () => {
    markHistoryFloor()
    pushOverlaySentinel()
    // La centinela es una entrada nueva por encima del suelo…
    expect(fake.idx).toBe(1)
    expect(window.history.state).toMatchObject({ lgOverlayBack: true })
    // …y NO lleva `lgFloor` (si no, la guarda no distinguiría suelo de centinela).
    expect(isAtHistoryFloor()).toBe(false)
    // El suelo, intacto, sigue siendo el suelo.
    expect(fake.entries[0]).toMatchObject({ lgFloor: true })
  })
})

// ── El hook a pelo, sobre el simulador ───────────────────────────────────────
describe('useOverlayBack sobre el simulador de historial', () => {
  test('abrir capa como PRIMERA interacción y cerrar por atrás no recarga', () => {
    markHistoryFloor() // el proveedor lo hace al montar; aquí a mano
    const close = () => {}
    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, close), {
      initialProps: { depth: 1 },
    })
    // Se empujó la centinela sobre el suelo.
    expect(fake.idx).toBe(1)
    expect(window.history.state).toMatchObject({ lgOverlayBack: true })

    // Atrás del usuario: consume la centinela, cierra la capa. Vuelve al suelo.
    fake.userBack()
    rerender({ depth: 0 })
    expect(fake.idx).toBe(0)
    expect(isAtHistoryFloor()).toBe(true)
    expect(fake.leftDocument).toBe(false)
  })

  test('cerrar por UI la ÚNICA capa hace back a la entrada de abajo, nunca cruza el suelo', () => {
    markHistoryFloor()
    // Simulamos una pantalla previa: hay una entrada de app por debajo (idx 1)
    // antes de abrir la capa (idx 2). Cerrar por UI debe volver a idx 1.
    window.history.pushState({ screen: 'trip' }, '')
    expect(fake.idx).toBe(1)

    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, () => {}), {
      initialProps: { depth: 1 },
    })
    expect(fake.idx).toBe(2)

    // Cierre por UI (depth 1→0): deshace su propia centinela con un back.
    rerender({ depth: 0 })
    expect(fake.idx).toBe(1)
    expect(fake.leftDocument).toBe(false)
  })

  test('GUARDA: cerrar por UI la capa cuando la centinela quedó fusionada con el suelo NO recarga', () => {
    // Reproduce el descuadre de #983: un `replaceState` de terceros (TripPage
    // reescribe el hash conservando el `state`) puede dejar `lgFloor` y
    // `lgOverlayBack` en la MISMA entrada, y esa entrada ser el tope. Sin la
    // guarda, la limpieza haría `history.back()` desde el suelo → recarga.
    markHistoryFloor()
    // Fusiona ambos marcadores en la entrada-suelo (idx 0) y ninguna entrada más.
    window.history.replaceState({ lgFloor: true, lgOverlayBack: true }, '')
    expect(fake.idx).toBe(0)

    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, () => {}), {
      initialProps: { depth: 1 },
    })
    // OJO: el hook empuja su centinela → idx 1. Para forzar el caso límite,
    // volvemos a fusionar en el tope actual el `lgFloor` (como haría el
    // replaceState de terceros sobre la centinela recién creada).
    window.history.replaceState({ lgFloor: true, lgOverlayBack: true }, '')
    expect(isAtHistoryFloor()).toBe(true)
    const backsBefore = fake.backCalls

    // Cierre por UI: SIN la guarda, la limpieza vería `lgOverlayBack` en el tope
    // y emitiría `history.back()` (backCalls +1) — el back fatal desde una
    // entrada marcada como suelo. CON la guarda NO emite ningún back.
    rerender({ depth: 0 })
    expect(fake.backCalls).toBe(backsBefore)
    expect(fake.leftDocument).toBe(false)
  })

  test('atrás repetido más veces que capas: la lógica de capas no genera la recarga', () => {
    markHistoryFloor()
    // Una capa abierta como primera interacción.
    const { rerender } = renderHook(({ depth }) => useOverlayBack(depth, () => {}), {
      initialProps: { depth: 1 },
    })
    expect(fake.idx).toBe(1)

    // 1er atrás: cierra la capa, vuelve al suelo (sin recarga).
    fake.userBack()
    rerender({ depth: 0 })
    expect(fake.idx).toBe(0)
    expect(fake.leftDocument).toBe(false)

    // 2º atrás (de más): es el USUARIO saliendo desde el suelo. No lo emite la
    // app; es legítimo. Lo que exige el fix es que la LÓGICA DE CAPAS no haya
    // generado ningún back extra que adelantara este cruce.
    expect(fake.backCalls).toBe(1) // exactamente el del cierre por atrás
  })
})

// ── El coordinador completo, capas anidadas reales ───────────────────────────
function Layer({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  useOverlayLayer(open, () => setOpen(false))
  return (
    <div>
      <button onClick={() => setOpen(true)}>abrir {name}</button>
      {open && (
        <div role="dialog" aria-label={name}>
          <button onClick={() => setOpen(false)}>cerrar {name}</button>
        </div>
      )}
    </div>
  )
}

describe('OverlayBackProvider + capas: nunca cruza el suelo', () => {
  test('el proveedor marca el suelo al montar', () => {
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
      </OverlayBackProvider>,
    )
    expect(isAtHistoryFloor()).toBe(true)
  })

  test('abrir capa como primera acción, cerrar por atrás: vuelve al suelo, sin recarga', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
      </OverlayBackProvider>,
    )
    await user.click(screen.getByText('abrir hoja'))
    expect(fake.idx).toBe(1)

    fake.userBack()
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()
    expect(fake.idx).toBe(0)
    expect(isAtHistoryFloor()).toBe(true)
    expect(fake.leftDocument).toBe(false)
  })

  test('abrir/cerrar por UI repetido desde el suelo no deja recarga ni descuadre', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
      </OverlayBackProvider>,
    )
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByText('abrir hoja'))
      await user.click(screen.getByText('cerrar hoja'))
    }
    // Tras abrir/cerrar por UI varias veces seguimos anclados al suelo, listos
    // para que un atrás del usuario salga limpio (sin recarga intermedia).
    expect(fake.leftDocument).toBe(false)
    expect(isAtHistoryFloor()).toBe(true)
  })

  test('anidadas: lightbox sobre hoja, atrás capa a capa, termina en el suelo', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
        <Layer name="lightbox" />
      </OverlayBackProvider>,
    )
    await user.click(screen.getByText('abrir hoja'))
    await user.click(screen.getByText('abrir lightbox'))

    fake.userBack() // cierra lightbox
    expect(screen.queryByRole('dialog', { name: 'lightbox' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'hoja' })).toBeInTheDocument()
    expect(fake.leftDocument).toBe(false)

    fake.userBack() // cierra hoja
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()
    expect(fake.idx).toBe(0)
    expect(fake.leftDocument).toBe(false)
  })

  test('adelante tras cerrar por atrás: no reabre ni recarga', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
      </OverlayBackProvider>,
    )
    await user.click(screen.getByText('abrir hoja'))
    fake.userBack()
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()

    // El usuario pulsa ADELANTE: re-navega a la entrada-fantasma. No hay
    // listener (capa cerrada) → no reabre nada y no sale del documento.
    act(() => {
      window.history.forward()
    })
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()
    expect(fake.leftDocument).toBe(false)
  })

  test('cerrar-y-abrir en el mismo gesto (una capa releva a otra) no cruza el suelo', async () => {
    // Dos capas mutuamente excluyentes: abrir la 2ª mientras se cierra la 1ª.
    // `depth` no cruza 0 (queda en 1), así que no debe tocar el historial de más.
    function Pair() {
      const [which, setWhich] = useState<null | 'a' | 'b'>(null)
      useOverlayLayer(which === 'a', () => setWhich(null))
      useOverlayLayer(which === 'b', () => setWhich(null))
      return (
        <div>
          <button onClick={() => setWhich('a')}>abrir a</button>
          <button onClick={() => setWhich('b')}>relevo a→b</button>
          {which && <div role="dialog" aria-label={which} />}
        </div>
      )
    }
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Pair />
      </OverlayBackProvider>,
    )
    await user.click(screen.getByText('abrir a'))
    const idxWithA = fake.idx
    await user.click(screen.getByText('relevo a→b'))
    // El relevo no empuja una segunda centinela (una sola entrada nuestra).
    expect(fake.idx).toBe(idxWithA)

    // Atrás cierra la capa activa (b) y vuelve al suelo, sin recarga.
    fake.userBack()
    expect(fake.leftDocument).toBe(false)
    expect(fake.idx).toBe(0)
  })
})
