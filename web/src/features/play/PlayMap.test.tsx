import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { PlayMap } from './PlayMap'

// PlayMap monta el SDK real de Google Maps (@vis.gl/react-google-maps), que
// necesita red + API key y no corre en jsdom. Mismo criterio que el stub de
// galería (`src/gallery/stubs/react-google-maps.tsx`): un <Map> de mentira que
// expone `mapTypeId` como atributo para poder comprobar qué capa pinta el
// toggle, sin arrastrar el SDK real. Marker/Polyline/useMap no hacen falta
// para estos tests (issue #602: solo cubren la capa por defecto y el toggle
// propio de PlayMap) — se dejan como no-op para satisfacer los imports.
interface MockMapProps {
  mapTypeId?: string
  children?: ReactNode
}
vi.mock('@vis.gl/react-google-maps', () => ({
  Map: ({ mapTypeId, children }: MockMapProps) => (
    <div data-testid="google-map" data-map-type={mapTypeId}>
      {children}
    </div>
  ),
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

// Misma clave que el toggle de MapPicker (ver comentario en PlayMap.tsx junto
// a `LAYER_KEY`): se repite aquí literal a propósito, para que el test note si
// alguna vez cambia sin querer.
const LAYER_KEY = 'lg.mapLayer'

function noop() {}

describe('PlayMap — capa base satélite y toggle (issue #602)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('adivinando: satélite (hybrid) por defecto, sin preferencia guardada', () => {
    render(<PlayMap guess={null} answer={null} locked={false} onPick={noop} meUserId="u1" />)

    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'hybrid')
    expect(screen.getByRole('button', { name: 'Satélite' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('el toggle cambia a callejero (roadmap) y persiste la preferencia', () => {
    render(<PlayMap guess={null} answer={null} locked={false} onPick={noop} meUserId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }))

    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'roadmap')
    expect(screen.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(LAYER_KEY)).toBe('street')
  })

  test('respeta la preferencia "Mapa" ya guardada (misma clave que MapPicker)', () => {
    localStorage.setItem(LAYER_KEY, 'street')

    render(<PlayMap guess={null} answer={null} locked={false} onPick={noop} meUserId="u1" />)

    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'roadmap')
    expect(screen.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('cualquier valor guardado que no sea "street" cae a satélite', () => {
    localStorage.setItem(LAYER_KEY, 'algo-viejo-o-corrupto')

    render(<PlayMap guess={null} answer={null} locked={false} onPick={noop} meUserId="u1" />)

    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'hybrid')
  })

  test('revelado (locked): siempre satélite y sin toggle, pase lo que pase por `preset`', () => {
    render(
      <PlayMap
        guess={null}
        answer={null}
        locked
        onPick={noop}
        meUserId="u1"
        // `jugar` = callejero en el prop histórico; el revelado lo ignora a
        // propósito (decisión #602: "aplica satélite a ambos").
        preset="jugar"
      />,
    )

    expect(screen.getByTestId('google-map')).toHaveAttribute('data-map-type', 'hybrid')
    expect(screen.queryByRole('button', { name: 'Satélite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mapa' })).not.toBeInTheDocument()
  })
})
