import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AllGuessesMap, visibleLabelUserIds, type GuessMarker } from './AllGuessesMap'

// `answerIcon`/`guessIcon` construyen `google.maps.Size`/`Point` (namespace real
// del SDK, no disponible en jsdom) — mismo motivo que `streetview.test.ts`:
// inyectamos el mínimo global que necesitan para poder montar el componente.
function FakeSize(width: number, height: number) {
  return { width, height }
}
function FakePoint(x: number, y: number) {
  return { x, y }
}
beforeAll(() => {
  // @ts-expect-error: inyectamos un global `google` mínimo para el test.
  globalThis.google = { maps: { Size: FakeSize, Point: FakePoint } }
})
afterAll(() => {
  // @ts-expect-error: contrapartida del beforeAll de arriba.
  delete globalThis.google
})

// Mismo doble que PlayMap.test.tsx: evita cargar el SDK real de Google Maps
// (red + API key, no corre en jsdom). `Marker` sí se renderiza aquí (a
// diferencia del stub de galería) para poder comprobar qué `label`/`icon`
// recibe cada uno — es justo lo que cubren estos tests (issue #794/#795).
interface MockMapProps {
  mapTypeId?: string
  children?: ReactNode
}
interface MockMarkerProps {
  icon?: { url: string }
  label?: { text: string }
  title?: string
}
vi.mock('@vis.gl/react-google-maps', () => ({
  Map: ({ mapTypeId, children }: MockMapProps) => (
    <div data-testid="google-map" data-map-type={mapTypeId}>
      {children}
    </div>
  ),
  Marker: ({ icon, label, title }: MockMarkerProps) => (
    <div data-testid="marker" data-title={title} data-label={label?.text} data-icon={icon?.url} />
  ),
  useMap: () => null,
}))

function guess(over: Partial<GuessMarker> & Pick<GuessMarker, 'userId' | 'name'>): GuessMarker {
  return { lat: 41, lng: 2, avatar: null, points: 0, ...over }
}

describe('visibleLabelUserIds (issue #795 — legibilidad con muchos pines)', () => {
  test('con pocos jugadores (< 5), todos llevan label', () => {
    const guesses = [
      guess({ userId: 'a', name: 'Ana', points: 100 }),
      guess({ userId: 'b', name: 'Bea', points: 50 }),
      guess({ userId: 'c', name: 'Cris', points: 10 }),
    ]
    const ids = visibleLabelUserIds(guesses)
    expect(ids).toEqual(new Set(['a', 'b', 'c']))
  })

  test('con 5+ jugadores, solo el top-3 por puntos lleva label', () => {
    const guesses = [
      guess({ userId: 'a', name: 'Ana', points: 500 }),
      guess({ userId: 'b', name: 'Bea', points: 900 }),
      guess({ userId: 'c', name: 'Cris', points: 100 }),
      guess({ userId: 'd', name: 'Dani', points: 700 }),
      guess({ userId: 'e', name: 'Eva', points: 50 }),
    ]
    const ids = visibleLabelUserIds(guesses)
    expect(ids).toEqual(new Set(['b', 'd', 'a']))
  })

  test('con 5+ jugadores, el PROPIO jugador conserva su label aunque no esté en el top-3', () => {
    const guesses = [
      guess({ userId: 'a', name: 'Ana', points: 500 }),
      guess({ userId: 'b', name: 'Bea', points: 900 }),
      guess({ userId: 'c', name: 'Cris', points: 100 }),
      guess({ userId: 'd', name: 'Dani', points: 700 }),
      guess({ userId: 'yo', name: 'Yo', points: 10 }),
    ]
    const ids = visibleLabelUserIds(guesses, 'yo')
    expect(ids.has('yo')).toBe(true)
    expect(ids.size).toBe(4) // top-3 + yo, sin duplicar si ya estuviera dentro
  })

  test('si el propio jugador YA está en el top-3, no se duplica', () => {
    const guesses = [
      guess({ userId: 'yo', name: 'Yo', points: 900 }),
      guess({ userId: 'b', name: 'Bea', points: 500 }),
      guess({ userId: 'c', name: 'Cris', points: 400 }),
      guess({ userId: 'd', name: 'Dani', points: 100 }),
      guess({ userId: 'e', name: 'Eva', points: 50 }),
    ]
    const ids = visibleLabelUserIds(guesses, 'yo')
    expect(ids.size).toBe(3)
  })
})

describe('AllGuessesMap', () => {
  const answer = { lat: 40, lng: 1 }

  test('satélite con etiquetas (hybrid), coherente con el revelado de PlayMap', () => {
    render(<AllGuessesMap answer={answer} guesses={[]} />)
    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'hybrid')
  })

  test('pinta un marcador por cada jugador + la respuesta', () => {
    const guesses = [guess({ userId: 'a', name: 'Ana' }), guess({ userId: 'b', name: 'Bea' })]
    render(<AllGuessesMap answer={answer} guesses={guesses} />)
    // 1 respuesta + 2 jugadores.
    expect(screen.getAllByTestId('marker')).toHaveLength(3)
  })

  test('el pin del propio jugador lleva "(tú)" en el label y anillo resaltado', () => {
    const guesses = [guess({ userId: 'yo', name: 'Yo', avatar: null })]
    render(<AllGuessesMap answer={answer} guesses={guesses} meUserId="yo" />)
    const markers = screen.getAllByTestId('marker')
    const mine = markers.find((m) => m.getAttribute('data-title') === 'Yo')
    expect(mine).toBeDefined()
    expect(mine).toHaveAttribute('data-label', 'Yo (tú)')
    // El SVG del pin propio lleva el anillo teal (#0f766e) en vez del blanco.
    const icon = decodeURIComponent(mine!.getAttribute('data-icon') ?? '')
    expect(icon).toContain('#0f766e')
  })

  test('con 5+ jugadores, el pin fuera del top-3 (y que no es el propio) no lleva label', () => {
    const guesses = [
      guess({ userId: 'a', name: 'Ana', points: 500 }),
      guess({ userId: 'b', name: 'Bea', points: 900 }),
      guess({ userId: 'c', name: 'Cris', points: 100 }),
      guess({ userId: 'd', name: 'Dani', points: 700 }),
      guess({ userId: 'e', name: 'Eva', points: 50 }),
    ]
    render(<AllGuessesMap answer={answer} guesses={guesses} meUserId="a" />)
    const markers = screen.getAllByTestId('marker')
    const cris = markers.find((m) => m.getAttribute('data-title') === 'Cris')
    expect(cris).not.toHaveAttribute('data-label')
  })
})
