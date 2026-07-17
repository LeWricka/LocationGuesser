import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AllGuessesMap, type GuessMarker } from './AllGuessesMap'

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
// (red + API key, no corre en jsdom). `Marker`/`Polyline` sí se renderizan
// aquí (a diferencia del stub de galería) para poder comprobar qué
// `icon`/`strokeWeight`/`strokeOpacity` recibe cada uno — es justo lo que
// cubren estos tests (issue #794/#795/#811).
interface MockMapProps {
  mapTypeId?: string
  children?: ReactNode
}
interface MockMarkerProps {
  icon?: { url: string }
  title?: string
}
interface MockPolylineProps {
  strokeColor?: string
  strokeWeight?: number
  strokeOpacity?: number
}
vi.mock('@vis.gl/react-google-maps', () => ({
  Map: ({ mapTypeId, children }: MockMapProps) => (
    <div data-testid="google-map" data-map-type={mapTypeId}>
      {children}
    </div>
  ),
  Marker: ({ icon, title }: MockMarkerProps) => (
    <div data-testid="marker" data-title={title} data-icon={icon?.url} />
  ),
  Polyline: ({ strokeColor, strokeWeight, strokeOpacity }: MockPolylineProps) => (
    <div
      data-testid="line"
      data-color={strokeColor}
      data-weight={strokeWeight}
      data-opacity={strokeOpacity}
    />
  ),
  useMap: () => null,
}))

function guess(over: Partial<GuessMarker> & Pick<GuessMarker, 'userId' | 'name'>): GuessMarker {
  return { lat: 41, lng: 2, avatar: null, rank: 1, ...over }
}

describe('AllGuessesMap', () => {
  const answer = { lat: 40, lng: 1 }

  test('satélite con etiquetas (hybrid), coherente con el revelado de PlayMap', () => {
    render(<AllGuessesMap answer={answer} guesses={[]} />)
    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'hybrid')
  })

  test('pinta un marcador por cada jugador + la respuesta', () => {
    const guesses = [
      guess({ userId: 'a', name: 'Ana', rank: 1 }),
      guess({ userId: 'b', name: 'Bea', rank: 2 }),
    ]
    render(<AllGuessesMap answer={answer} guesses={guesses} />)
    // 1 respuesta + 2 jugadores.
    expect(screen.getAllByTestId('marker')).toHaveLength(3)
  })

  // Issue #811: fuera las etiquetas de texto — el pin lleva un badge de puesto
  // incrustado en su propio SVG (verificado en avatarPin.test.ts), no un
  // `label` de Marker aparte.
  test('los pines de jugador NO llevan `label` (issue #811, fuera el texto del mapa)', () => {
    const guesses = [guess({ userId: 'a', name: 'Ana', rank: 1 })]
    render(<AllGuessesMap answer={answer} guesses={guesses} />)
    const markers = screen.getAllByTestId('marker')
    const mine = markers.find((m) => m.getAttribute('data-title') === 'Ana')
    expect(mine).not.toHaveAttribute('data-label')
  })

  test('el pin del propio jugador lleva el anillo teal resaltado y su puesto en el SVG', () => {
    const guesses = [guess({ userId: 'yo', name: 'Yo', avatar: null, rank: 2 })]
    render(<AllGuessesMap answer={answer} guesses={guesses} meUserId="yo" />)
    const markers = screen.getAllByTestId('marker')
    const mine = markers.find((m) => m.getAttribute('data-title') === 'Yo')
    expect(mine).toBeDefined()
    const icon = decodeURIComponent(mine!.getAttribute('data-icon') ?? '')
    // Anillo propio (issue #795): teal profundo en vez de blanco.
    expect(icon).toContain('#0f766e')
    // Badge de puesto 2º (issue #811): disco plata.
    expect(icon).toContain('#a9a39a')
  })

  test('pin fuera del podio (4º+): badge neutro, no oro/plata/bronce', () => {
    const guesses = [guess({ userId: 'd', name: 'Dani', rank: 4 })]
    render(<AllGuessesMap answer={answer} guesses={guesses} />)
    const markers = screen.getAllByTestId('marker')
    const mine = markers.find((m) => m.getAttribute('data-title') === 'Dani')
    const icon = decodeURIComponent(mine!.getAttribute('data-icon') ?? '')
    expect(icon).toContain('#575f6c')
    expect(icon).not.toContain('#c9a24b')
  })

  // Issue #811: línea de cada jugada a la respuesta, la propia destacada.
  describe('líneas a la respuesta', () => {
    test('una línea por cada jugador', () => {
      const guesses = [guess({ userId: 'a', name: 'Ana' }), guess({ userId: 'b', name: 'Bea' })]
      render(<AllGuessesMap answer={answer} guesses={guesses} />)
      expect(screen.getAllByTestId('line')).toHaveLength(2)
    })

    test('las ajenas van finas y translúcidas; la propia, más gruesa y casi opaca', () => {
      const guesses = [guess({ userId: 'yo', name: 'Yo' }), guess({ userId: 'otro', name: 'Otro' })]
      render(<AllGuessesMap answer={answer} guesses={guesses} meUserId="yo" />)
      const lines = screen.getAllByTestId('line')
      const mine = lines.find((l) => Number(l.getAttribute('data-opacity')) > 0.5)
      const other = lines.find((l) => l !== mine)
      expect(mine).toBeDefined()
      expect(other).toBeDefined()
      expect(Number(mine!.getAttribute('data-weight'))).toBeGreaterThan(
        Number(other!.getAttribute('data-weight')),
      )
      expect(Number(other!.getAttribute('data-opacity'))).toBeLessThan(0.5)
    })
  })
})
