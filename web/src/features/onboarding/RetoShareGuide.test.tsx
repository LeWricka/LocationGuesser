import { useRef, type RefObject } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareGuide } from './RetoShareGuide'
import coachStyles from './CoachMark.module.css'

// jsdom no implementa scrollIntoView; RetoShareGuide lo usa para llevar a la
// vista la tarjeta de puntos que resalta el coach-mark.
Element.prototype.scrollIntoView = vi.fn()

// Arnés con un objetivo real (la tarjeta de puntos del reveal): el coach-mark
// ancla a él y sigue visible DEBAJO (no hay overlay opaco que lo sustituya).
function Harness({
  onNext = vi.fn(),
  onSkip = vi.fn(),
}: {
  onNext?: () => void
  onSkip?: () => void
}) {
  const resultRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={resultRef}>tarjeta de resultado</div>
      <RetoShareGuide
        resultRef={resultRef as RefObject<HTMLElement | null>}
        onNext={onNext}
        onSkip={onSkip}
      />
    </>
  )
}

describe('RetoShareGuide (rediseño #891)', () => {
  test('señala el resultado sin taparlo (es un coach-mark, no un overlay)', () => {
    render(<Harness />)
    expect(screen.getByText('Esto es tu resultado')).toBeInTheDocument()
    // El reveal sigue en el DOM debajo.
    expect(screen.getByText('tarjeta de resultado')).toBeInTheDocument()
  })

  test('"Siguiente" llama a onNext (el llamador navega al viaje real)', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  test('"Saltar" llama a onSkip (directo al Marcador, sin registro)', () => {
    const onSkip = vi.fn()
    render(<Harness onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  // A prueba de balas (issue #888): el único coach-mark ancla a la zona del
  // reveal, así que DEBE ser `blocking`. Si alguien lo quita sin querer, este
  // test lo detecta (jsdom no caza el pass-through en sí, ver CoachMark.test).
  test('el coach-mark es bloqueante', () => {
    const { container } = render(<Harness />)
    const layerClass = coachStyles.layerBlocking as string
    expect(container.getElementsByClassName(layerClass).length).toBe(1)
  })
})
