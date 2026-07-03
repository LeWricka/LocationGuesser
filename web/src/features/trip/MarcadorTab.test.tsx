import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarcadorTab } from './MarcadorTab'
import type { LeaderboardEntry } from '../../lib/leaderboard'

// Simula prefers-reduced-motion para que CountUp (dentro de MarcadorTab) no
// dependa del jsdom real, que no implementa matchMedia (mismo patrón que
// src/ui/CountUp.test.tsx). Reduced-motion muestra el valor final directo, que
// es justo lo que queremos comprobar por texto en los tests de contenido.
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

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { userId: 'u1', name: 'Ana', avatar: null, points: 100, plays: 2, ...overrides }
}

const noop = () => {}

describe('MarcadorTab', () => {
  test('estado vacío: mensaje + invitar (y crear reto si puede)', () => {
    render(<MarcadorTab leaderboard={[]} onInvite={noop} onAddChallenge={noop} canCreate={true} />)
    expect(
      screen.getByText('Cuando alguien adivine un reto, aquí aparecerá la clasificación.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Invitar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear un reto/ })).toBeInTheDocument()
  })

  test('ordena por puntos desc y muestra el número de partidas', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300, plays: 3 }),
      entry({ userId: 'u2', name: 'Beto', points: 200, plays: 1 }),
      entry({ userId: 'u3', name: 'Caro', points: 50, plays: 5 }),
    ]
    render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    // El orden del DOM sigue el orden del array (ya viene ordenado por puntos).
    expect(filas[0]).toHaveTextContent('Ana')
    expect(filas[1]).toHaveTextContent('Beto')
    expect(filas[2]).toHaveTextContent('Caro')
    expect(screen.getByText('1 partida')).toBeInTheDocument()
    expect(screen.getByText('5 partidas')).toBeInTheDocument()
  })

  test('la barra es proporcional a los puntos del líder', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 200 }),
      entry({ userId: 'u2', name: 'Beto', points: 100 }),
    ]
    const { container } = render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    const filas = container.querySelectorAll('li')
    const barraLider = filas[0].querySelector('[style*="--bar-pct"]') as HTMLElement
    const barraSegundo = filas[1].querySelector('[style*="--bar-pct"]') as HTMLElement
    // El líder marca el 100%; el segundo, la mitad (100/200).
    expect(barraLider.style.getPropertyValue('--bar-pct')).toBe('1')
    expect(barraSegundo.style.getPropertyValue('--bar-pct')).toBe('0.5')
  })

  test('marca la fila del líder (oro) distinta de la fila propia (teal)', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300 }),
      entry({ userId: 'u2', name: 'Beto', points: 100 }),
    ]
    const { container } = render(
      <MarcadorTab
        leaderboard={board}
        myUserId="u2"
        onInvite={noop}
        onAddChallenge={noop}
        canCreate={false}
      />,
    )
    const filas = container.querySelectorAll('li')
    // Fila del líder: clase de líder (oro), sin ser necesariamente "mi posición".
    expect(filas[0].className).toMatch(/lider/)
    expect(filas[0].className).not.toMatch(/miPosicion/)
    // Fila propia (no líder): "mi posición" (teal), sin la clase de líder.
    expect(filas[1].className).toMatch(/miPosicion/)
    expect(filas[1].className).not.toMatch(/lider/)
    expect(filas[1]).toHaveAttribute('aria-current', 'true')
  })
})
