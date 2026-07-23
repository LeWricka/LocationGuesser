import { useRef, type RefObject } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CoachMark } from './CoachMark'

// El coach-mark ancla a un elemento REAL vía `targetRef`: montamos un botón de
// prueba y se lo pasamos, igual que TripPage hace con el FAB "+" real.
function Harness({ onDismiss }: { onDismiss: () => void }) {
  const targetRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button type="button" ref={targetRef}>
        Objetivo real
      </button>
      <CoachMark
        targetRef={targetRef as RefObject<HTMLElement | null>}
        step="Empieza aquí"
        title="Guarda tu primer momento"
        ariaLabel="Guarda tu primer momento"
        body="Toca + y guarda dónde estás."
        onDismiss={onDismiss}
      />
    </div>
  )
}

describe('CoachMark', () => {
  test('pinta el paso, el título y el cuerpo sobre el objetivo real', () => {
    render(<Harness onDismiss={vi.fn()} />)
    expect(screen.getByText('Empieza aquí')).toBeInTheDocument()
    expect(screen.getByText('Guarda tu primer momento')).toBeInTheDocument()
    expect(screen.getByText('Toca + y guarda dónde estás.')).toBeInTheDocument()
  })

  test('"Saltar guía" llama a onDismiss', () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar guía' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test('admite una etiqueta de cierre distinta (reutilizable por otros pasos)', () => {
    const targetRef = { current: document.createElement('button') } as RefObject<HTMLElement | null>
    render(
      <CoachMark
        targetRef={targetRef}
        title="Otro paso"
        ariaLabel="Otro paso"
        body="Cuerpo"
        dismissLabel="Entendido"
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument()
  })

  test('sin objetivo montado (ref vacío), no pinta nada', () => {
    const targetRef = { current: null } as RefObject<HTMLElement | null>
    const { container } = render(
      <CoachMark targetRef={targetRef} title="X" ariaLabel="X" body="X" onDismiss={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

// Modo `blocking` (issue #888): a prueba de balas sobre un objetivo vivo (mapa
// Leaflet/Google). jsdom NO aplica `pointer-events`/z-index al hacer hit-testing
// (fireEvent dispara directo sobre el nodo, ignorando CSS) — por eso el
// bloqueo REAL del scrim contra un elemento interactivo de debajo lo cubre un
// test de Playwright con navegador real (ver
// e2e/gallery-coachmark-blocking.spec.ts, caso `onboarding-coachmark-blocking`).
// Aquí verificamos lo que SÍ es observable en jsdom: que `blocking` es aditivo
// (no rompe el render/las acciones por defecto) y que activa una clase
// DISTINTA a la del modo normal (el gancho CSS del scrim bloqueante).
describe('CoachMark — modo blocking (issue #888)', () => {
  function renderWithBlocking(blocking: boolean) {
    const targetRef = { current: document.createElement('div') } as RefObject<HTMLElement | null>
    const onDismiss = vi.fn()
    const onNext = vi.fn()
    const utils = render(
      <CoachMark
        targetRef={targetRef}
        title="Esto marcaron los demás"
        ariaLabel="Esto marcaron los demás"
        body="Cuerpo"
        primaryAction={{ label: 'Siguiente', onClick: onNext }}
        onDismiss={onDismiss}
        blocking={blocking}
      />,
    )
    return { ...utils, onDismiss, onNext }
  }

  test('blocking=true sigue pintando título, cuerpo y acciones (aditivo, no rompe el render)', () => {
    renderWithBlocking(true)
    expect(screen.getByText('Esto marcaron los demás')).toBeInTheDocument()
    expect(screen.getByText('Cuerpo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
  })

  test('blocking=true: "Siguiente" y "Saltar" siguen disparando su handler', () => {
    const { onNext, onDismiss } = renderWithBlocking(true)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar guía' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test('blocking=true aplica una capa distinta a blocking=false (gancho del scrim bloqueante)', () => {
    const { container: withBlocking, unmount } = renderWithBlocking(true)
    const blockingClassName = withBlocking.firstElementChild?.className
    unmount()
    const { container: withoutBlocking } = renderWithBlocking(false)
    const normalClassName = withoutBlocking.firstElementChild?.className
    expect(blockingClassName).toBeTruthy()
    expect(blockingClassName).not.toBe(normalClassName)
  })
})

// Señal global `data-coachmark-active` (issue #918): mientras CUALQUIER
// coach-mark está montado, marca `<html>` para que quien lo necesite (aquí,
// `.tabs` de TripPage vía CSS) suba por encima del oscurecido — nunca muta el
// nodo del `pinnedRef` directamente (eso violaría la regla de inmutabilidad de
// props de `eslint-plugin-react-hooks`). El efecto VISUAL (que de verdad quede
// legible sobre el scrim) lo cubren las capturas manuales/Playwright; aquí solo
// lo observable en jsdom: la marca aparece al montar y desaparece al desmontar.
describe('CoachMark — señal global data-coachmark-active (issue #918)', () => {
  test('marca <html> al montar y la retira al desmontar', () => {
    const targetRef = { current: document.createElement('div') } as RefObject<HTMLElement | null>
    const { unmount } = render(
      <CoachMark targetRef={targetRef} title="X" ariaLabel="X" body="X" onDismiss={vi.fn()} />,
    )
    expect(document.documentElement.getAttribute('data-coachmark-active')).toBe('true')

    unmount()
    expect(document.documentElement.hasAttribute('data-coachmark-active')).toBe(false)
  })
})

// `pinnedRef` (issue #918): NO eleva z-index (eso lo hace la señal global de
// arriba) — solo alimenta el cálculo de `cardStyle` para que la burbuja no
// crezca por encima del elemento pinneado. Aquí verificamos que pasarlo no
// rompe el render (el propio cálculo lo cubren las capturas manuales, que
// dependen de layout real que jsdom no reproduce).
describe('CoachMark — pinnedRef (issue #918)', () => {
  test('con pinnedRef, sigue pintando título/cuerpo/acciones con normalidad', () => {
    const targetRef = { current: document.createElement('div') } as RefObject<HTMLElement | null>
    const pinnedRef = {
      current: document.createElement('div'),
    } as RefObject<HTMLElement | null>
    render(
      <CoachMark
        targetRef={targetRef}
        title="Aquí se juega"
        ariaLabel="Aquí se juega"
        body="Cuerpo"
        onDismiss={vi.fn()}
        pinnedRef={pinnedRef}
      />,
    )
    expect(screen.getByText('Aquí se juega')).toBeInTheDocument()
    expect(screen.getByText('Cuerpo')).toBeInTheDocument()
  })
})
