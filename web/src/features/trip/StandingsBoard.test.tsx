import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StandingsBoard, type StandingsClasses } from './StandingsBoard'
import type { LeaderboardEntry } from '../../lib/leaderboard'

// jsdom no implementa `IntersectionObserver` (ver `ImmersiveClose` en
// StandingsBoard.tsx): sin él, el componente revela el cierre de inmediato —
// estos tests comprueban el contenido sin simular scroll ni un observer real.

function entry(overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'userId'>) {
  return { name: 'Jugador', avatar: null, points: 100, plays: 1, ...overrides }
}

// Escala mínima para el modo LEGACY (recap `TripWrap`): un valor de clase
// distinto por campo para poder distinguirlos si hiciera falta, aunque los
// tests aquí solo comprueban contenido/comportamiento, no nombres de clase.
const legacyClasses: StandingsClasses = {
  podium: 'podium',
  podiumCol: 'podiumCol',
  placeFirst: 'placeFirst',
  placeSecond: 'placeSecond',
  placeThird: 'placeThird',
  crown: 'crown',
  podiumDisc: 'podiumDisc',
  podiumAvatar: 'podiumAvatar',
  podiumName: 'podiumName',
  podiumPoints: 'podiumPoints',
  podiumPrize: 'podiumPrize',
  pedestal: 'pedestal',
  pedestalMedal: 'pedestalMedal',
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  board: 'board',
  row: 'row',
  rank: 'rank',
  player: 'player',
  playerName: 'playerName',
  rowRight: 'rowRight',
  bar: 'bar',
  rowPoints: 'rowPoints',
}

describe('StandingsBoard', () => {
  test('sin clasificación, no renderiza nada', () => {
    const { container } = render(<StandingsBoard leaderboard={[]} prizes={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('modo legacy (con `classes`, recap TripWrap)', () => {
    test('con 3+ jugadores, pinta el podio compartido (corona del 1º)', () => {
      const leaderboard = [
        entry({ userId: 'u1', name: 'Ana', points: 300 }),
        entry({ userId: 'u2', name: 'Beto', points: 200 }),
        entry({ userId: 'u3', name: 'Caro', points: 100 }),
      ]
      const { container } = render(
        <StandingsBoard leaderboard={leaderboard} prizes={null} classes={legacyClasses} />,
      )
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(screen.getByText('Beto')).toBeInTheDocument()
      expect(screen.getByText('Caro')).toBeInTheDocument()
      expect(container.querySelector('.lucide-crown')).toBeInTheDocument()
      // Sin cabecera/resumen/CTA propios: el llamador (TripWrap) los pone alrededor.
      expect(screen.queryByRole('heading', { name: 'Clasificación' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Ver marcador/ })).not.toBeInTheDocument()
    })

    test('con menos de 3, pinta la lista compacta con la clase inyectada', () => {
      const leaderboard = [entry({ userId: 'u1', name: 'Ana', points: 100 })]
      const { container } = render(
        <StandingsBoard leaderboard={leaderboard} prizes={null} classes={legacyClasses} />,
      )
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(container.querySelector('ol.board')).toBeInTheDocument()
    })
  })

  describe('modo inmersivo (sin `classes`, cierre de la Bitácora)', () => {
    test('con 3+ jugadores, pinta cabecera + podio con corona del 1º', () => {
      const leaderboard = [
        entry({ userId: 'u1', name: 'Ana', points: 300 }),
        entry({ userId: 'u2', name: 'Beto', points: 200 }),
        entry({ userId: 'u3', name: 'Caro', points: 100 }),
      ]
      const { container } = render(
        <StandingsBoard
          leaderboard={leaderboard}
          prizes={null}
          challengesPlayed={4}
          onViewMarcador={vi.fn()}
        />,
      )
      expect(screen.getByRole('heading', { name: 'Clasificación' })).toBeInTheDocument()
      expect(screen.getByText('La liga del viaje')).toBeInTheDocument()
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(screen.getByText('Beto')).toBeInTheDocument()
      expect(screen.getByText('Caro')).toBeInTheDocument()
      expect(container.querySelector('.lucide-crown')).toBeInTheDocument()
    })

    test('con menos de 3, pinta la lista sin podio', () => {
      const leaderboard = [
        entry({ userId: 'u1', name: 'Ana', points: 300 }),
        entry({ userId: 'u2', name: 'Beto', points: 200 }),
      ]
      render(<StandingsBoard leaderboard={leaderboard} prizes={null} />)
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(screen.getByText('Beto')).toBeInTheDocument()
      expect(screen.getAllByRole('img', { name: /puntos/ })).toHaveLength(2)
    })

    test('el resumen muestra retos jugados y nº de jugadores', () => {
      const leaderboard = [
        entry({ userId: 'u1', name: 'Ana', points: 300 }),
        entry({ userId: 'u2', name: 'Beto', points: 200 }),
        entry({ userId: 'u3', name: 'Caro', points: 100 }),
      ]
      render(<StandingsBoard leaderboard={leaderboard} prizes={null} challengesPlayed={5} />)
      expect(screen.getByText(/5 retos jugados/)).toBeInTheDocument()
      expect(screen.getByText(/3 jugadores/)).toBeInTheDocument()
    })

    test('singular correcto con 1 reto jugado y 1 jugador', () => {
      const leaderboard = [entry({ userId: 'u1', name: 'Ana', points: 100 })]
      render(<StandingsBoard leaderboard={leaderboard} prizes={null} challengesPlayed={1} />)
      expect(screen.getByText(/1 reto jugado\b/)).toBeInTheDocument()
      expect(screen.getByText(/1 jugador\b/)).toBeInTheDocument()
    })

    test('sin `onViewMarcador`, no pinta el CTA', () => {
      const leaderboard = [entry({ userId: 'u1', name: 'Ana', points: 100 })]
      render(<StandingsBoard leaderboard={leaderboard} prizes={null} />)
      expect(screen.queryByRole('button', { name: /Ver marcador/ })).not.toBeInTheDocument()
    })

    test('tocar "Ver marcador" llama a onViewMarcador', async () => {
      const user = userEvent.setup()
      const onViewMarcador = vi.fn()
      const leaderboard = [entry({ userId: 'u1', name: 'Ana', points: 100 })]
      render(
        <StandingsBoard leaderboard={leaderboard} prizes={null} onViewMarcador={onViewMarcador} />,
      )
      await user.click(screen.getByRole('button', { name: /Ver marcador/ }))
      expect(onViewMarcador).toHaveBeenCalled()
    })

    test('con premio del 1º definido, el podio lo muestra', () => {
      const leaderboard = [
        entry({ userId: 'u1', name: 'Ana', points: 300 }),
        entry({ userId: 'u2', name: 'Beto', points: 200 }),
        entry({ userId: 'u3', name: 'Caro', points: 100 }),
      ]
      render(<StandingsBoard leaderboard={leaderboard} prizes={{ first: 'Cena pagada' }} />)
      expect(screen.getByText('Cena pagada')).toBeInTheDocument()
    })
  })
})
