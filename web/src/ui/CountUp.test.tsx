import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountUp } from './CountUp'

// Simula prefers-reduced-motion: matchMedia que devuelve `matches` controlable.
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
})

describe('CountUp', () => {
  test('bajo reduced-motion muestra el valor final (sin animar)', () => {
    mockReducedMotion(true)
    render(<CountUp value={4250} />)
    // El separador de miles depende del ICU del entorno; comprobamos los dígitos.
    expect(screen.getByText(/4.?250/)).toBeInTheDocument()
  })

  test('arranca desde 0 cuando hay movimiento (luego anima con rAF)', () => {
    mockReducedMotion(false)
    render(<CountUp value={4250} />)
    // Primer render: progreso 0 → muestra 0 antes del primer frame.
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
