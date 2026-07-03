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

  test('con ≤3 jugadores solo hay podio (sin lista compacta debajo)', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300 }),
      entry({ userId: 'u2', name: 'Beto', points: 200 }),
      entry({ userId: 'u3', name: 'Caro', points: 50 }),
    ]
    render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    expect(screen.getByRole('list', { name: 'Podio' })).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Resto de la clasificación' }),
    ).not.toBeInTheDocument()
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Ana')
    expect(filas[1]).toHaveTextContent('Beto')
    expect(filas[2]).toHaveTextContent('Caro')
  })

  test('con 1 jugador, el podio muestra solo al líder', () => {
    mockReducedMotion(true)
    const board = [entry({ userId: 'u1', name: 'Ana', points: 300 })]
    render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  test('4º en adelante cae en la lista compacta, ordenada por puntos desc, con nº de partidas', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
      entry({ userId: 'u4', name: 'Dani', points: 90, plays: 5 }),
      entry({ userId: 'u5', name: 'Eva', points: 80, plays: 1 }),
    ]
    render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    expect(screen.getByRole('list', { name: 'Podio' })).toBeInTheDocument()
    const resto = screen.getByRole('list', { name: 'Resto de la clasificación' })
    expect(resto).toBeInTheDocument()

    // Orden del DOM: podio (1º-3º) primero, luego la lista compacta (4º+); ambos
    // en orden de puntos desc.
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(5)
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Beto'),
      expect.stringContaining('Caro'),
      expect.stringContaining('Dani'),
      expect.stringContaining('Eva'),
    ])
    expect(screen.getByText('5 partidas')).toBeInTheDocument()
    expect(screen.getByText('1 partida')).toBeInTheDocument()
  })

  test('la barra de la lista compacta es proporcional a los puntos del líder del viaje', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
      entry({ userId: 'u4', name: 'Dani', points: 100 }),
      entry({ userId: 'u5', name: 'Eva', points: 20 }),
    ]
    render(
      <MarcadorTab leaderboard={board} onInvite={noop} onAddChallenge={noop} canCreate={false} />,
    )
    const resto = screen.getByRole('list', { name: 'Resto de la clasificación' })
    const filasResto = resto.querySelectorAll('li')
    const barraDani = filasResto[0].querySelector('[style*="--bar-pct"]') as HTMLElement
    const barraEva = filasResto[1].querySelector('[style*="--bar-pct"]') as HTMLElement
    // Dani: 100/400 = 25% del líder (Ana, no del podio en general).
    expect(barraDani.style.getPropertyValue('--bar-pct')).toBe('0.25')
    // Eva: 20/400 = 5%, pero el suelo del 8% evita que la barra desaparezca.
    expect(barraEva.style.getPropertyValue('--bar-pct')).toBe('0.08')
    // El podio no lleva barra de puntuación (su jerarquía la da la composición).
    const podio = screen.getByRole('list', { name: 'Podio' })
    expect(podio.querySelector('[style*="--bar-pct"]')).toBeNull()
  })

  test('el puesto 1º lleva la clase de líder; "Tú" solo aparece en la propia columna', () => {
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
    // Columna del líder: clase de puesto 1º; no es "Tú" (no coincide con myUserId).
    expect(filas[0].className).toMatch(/podio1/)
    expect(filas[0]).not.toHaveTextContent('Tú')
    // Columna propia (no líder, puesto 2º): etiqueta "Tú" — sin teñir toda la
    // columna de teal, que competiría con el color del puesto (issue #594).
    expect(filas[1].className).toMatch(/podio2/)
    expect(filas[1]).toHaveTextContent('Tú')
    expect(filas[1]).toHaveAttribute('aria-current', 'true')
  })
})
