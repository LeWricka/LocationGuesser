import { useRef, type RefObject } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareGuide } from './RetoShareGuide'
import coachStyles from './CoachMark.module.css'

// jsdom no implementa scrollIntoView; RetoShareGuide lo usa para llevar a la
// vista el objetivo de cada fase (mapa del resultado, luego lista + puntos).
Element.prototype.scrollIntoView = vi.fn()

// Arnés con DOS objetivos reales (issue #899): el mapa del resultado y la
// lista + tarjeta de puntos. El coach-mark ancla a uno u otro según la fase y
// ambos siguen visibles DEBAJO (no hay overlay opaco que los sustituya).
function Harness({
  onNext = vi.fn(),
  onSkip = vi.fn(),
}: {
  onNext?: () => void
  onSkip?: () => void
}) {
  const resultRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={resultRef}>tarjeta de resultado</div>
      <div ref={listRef}>lista y puntuación</div>
      <RetoShareGuide
        resultRef={resultRef as RefObject<HTMLElement | null>}
        listRef={listRef as RefObject<HTMLElement | null>}
        onNext={onNext}
        onSkip={onSkip}
      />
    </>
  )
}

describe('RetoShareGuide (rediseño #891, 2 pasos desde #899)', () => {
  test('paso 1: señala el resultado sin taparlo (es un coach-mark, no un overlay)', () => {
    render(<Harness />)
    expect(screen.getByText('Este es tu resultado')).toBeInTheDocument()
    // El reveal sigue en el DOM debajo.
    expect(screen.getByText('tarjeta de resultado')).toBeInTheDocument()
  })

  test('"Siguiente" en el paso 1 pasa al paso 2 (lista + puntuación) sin llamar a onNext', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Cómo vais')).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
  })

  test('"Siguiente" en el paso 2 llama a onNext (el llamador navega al viaje real)', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })) // paso 1 → 2
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })) // paso 2 → onNext
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  test('"Saltar" en el paso 1 llama a onSkip (directo al Marcador, sin registro)', () => {
    const onSkip = vi.fn()
    render(<Harness onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  test('"Saltar" en el paso 2 también llama a onSkip', () => {
    const onSkip = vi.fn()
    render(<Harness onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })) // paso 1 → 2
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  // A prueba de balas (issue #888): ambos pasos anclan a zonas del reveal, así
  // que DEBEN ser `blocking`. Si alguien lo quita sin querer, este test lo
  // detecta (jsdom no caza el pass-through en sí, ver CoachMark.test).
  test('los dos pasos son bloqueantes', () => {
    const { container } = render(<Harness />)
    const layerClass = coachStyles.layerBlocking as string
    expect(container.getElementsByClassName(layerClass).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })) // paso 1 → 2
    expect(container.getElementsByClassName(layerClass).length).toBe(1)
  })
})
