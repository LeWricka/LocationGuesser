import { describe, test, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { CountdownOverlay } from './CountdownOverlay'

// Simula prefers-reduced-motion: matchMedia con `matches` controlable.
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('CountdownOverlay', () => {
  test('cuenta 3 → 2 → 1 y llama onDone al terminar', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<CountdownOverlay photoUrl={null} onDone={onDone} />)

    // Arranca en 3 (no se ha disparado onDone todavía).
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1300))
    expect(screen.getByText('2')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(1300))
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()

    // Al consumir el 1 → entra en juego (onDone), una sola vez.
    act(() => void vi.advanceTimersByTime(1300))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test('bajo reduced-motion entra directo al juego sin pintar números', () => {
    mockReducedMotion(true)
    const onDone = vi.fn()
    const { container } = render(<CountdownOverlay photoUrl={null} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledTimes(1)
    // No se monta el overlay (no atrapamos al usuario en una pausa sin movimiento).
    expect(container).toBeEmptyDOMElement()
  })
})
