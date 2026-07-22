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
