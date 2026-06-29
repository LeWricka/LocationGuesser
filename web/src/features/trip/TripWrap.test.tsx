import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TripWrap } from './TripWrap'
import type { Moment } from '../../lib/trip'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { ChallengeWinner } from './useTripData'

// El mapa (MapLibre/Leaflet, WebGL) es pesado e irrelevante para este recap:
// lo stubbeamos por un marcador para testear el resto del wrap sin montarlo.
vi.mock('./TripMap', () => ({
  TripMap: () => <div data-testid="trip-map" />,
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

// Fábrica de momentos: solo lo que el recap mira (fecha, título, foto, reto).
function moment(overrides: Partial<Moment>): Moment {
  return {
    challengeId: 'c1',
    title: 'Momento',
    description: null,
    status: 'closed',
    isChallenge: false,
    date: '2025-04-08T10:00:00Z',
    deadlineAt: null,
    imageUrl: null,
    imagePath: null,
    lat: 41.4,
    lng: 2.1,
    guessedCount: 0,
    guessSeconds: null,
    svPanoId: null,
    country: null,
    ...overrides,
  }
}

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { userId: 'u1', name: 'Ana', avatar: null, points: 100, plays: 2, ...overrides }
}

describe('TripWrap', () => {
  test('muestra cabecera, stats y timeline con el resultado del reto', () => {
    const moments: Moment[] = [
      moment({ challengeId: 'm1', title: 'Sagrada Familia', isChallenge: false }),
      moment({
        challengeId: 'r1',
        title: 'Park Güell',
        isChallenge: true,
        date: '2025-04-10T10:00:00Z',
      }),
    ]
    const winners = new Map<string, ChallengeWinner>([
      ['r1', { name: 'Ana', points: 4200, guessedCount: 3 }],
    ])

    render(
      <TripWrap
        tripName="Barcelona 2025"
        moments={moments}
        route={[]}
        leaderboard={[entry({})]}
        prizes={null}
        winnersByChallenge={winners}
        onClose={() => {}}
      />,
    )

    // Cabecera y cierre.
    expect(screen.getByText('Barcelona 2025')).toBeInTheDocument()
    expect(screen.getByText('Viaje cerrado')).toBeInTheDocument()

    // Stats: 1 recuerdo, 1 reto, 1 jugador.
    expect(screen.getByText('recuerdo')).toBeInTheDocument()
    expect(screen.getByText('reto')).toBeInTheDocument()

    // Timeline con el resultado del reto: "Ganó Ana · 3 aciertos" (Ana aparece
    // también en la clasificación, así que comprobamos la frase del resultado).
    expect(screen.getByText('Sagrada Familia')).toBeInTheDocument()
    expect(screen.getByText('Park Güell')).toBeInTheDocument()
    expect(screen.getByText(/Ganó/)).toBeInTheDocument()
    expect(screen.getByText(/3 aciertos/)).toBeInTheDocument()
  })

  test('renderiza el podio cuando hay 3+ jugadores', () => {
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300 }),
      entry({ userId: 'u2', name: 'Beto', points: 200 }),
      entry({ userId: 'u3', name: 'Caro', points: 100 }),
    ]
    render(
      <TripWrap
        tripName="Ruta"
        moments={[moment({})]}
        route={[]}
        leaderboard={board}
        prizes={null}
        winnersByChallenge={new Map()}
        onClose={() => {}}
      />,
    )
    // El podio (markup compartido) muestra a los tres y la corona del 1º.
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Beto')).toBeInTheDocument()
    expect(screen.getByText('Caro')).toBeInTheDocument()
    expect(screen.getByText('👑')).toBeInTheDocument()
  })

  test('el mapa aparece solo si hay ruta', () => {
    const { rerender } = render(
      <TripWrap
        tripName="Sin ruta"
        moments={[moment({})]}
        route={[]}
        leaderboard={[]}
        prizes={null}
        winnersByChallenge={new Map()}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByTestId('trip-map')).not.toBeInTheDocument()

    rerender(
      <TripWrap
        tripName="Con ruta"
        moments={[moment({})]}
        route={[
          {
            challengeId: 'm1',
            lat: 41.4,
            lng: 2.1,
            title: 'Pin',
            imageUrl: null,
            date: '2025-04-08',
          },
        ]}
        leaderboard={[]}
        prizes={null}
        winnersByChallenge={new Map()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
  })

  test('cierra con la X y con Escape', () => {
    const onClose = vi.fn()
    render(
      <TripWrap
        tripName="X"
        moments={[moment({})]}
        route={[]}
        leaderboard={[]}
        prizes={null}
        winnersByChallenge={new Map()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByLabelText('Cerrar resumen'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
