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
// `useMap` devuelve el doble inyectado en `mockMap` (o null, el valor real
// mientras el SDK "no cargó"): permite espiar `setCenter` para cubrir el
// seguimiento de `centerOn` (issue #789) sin montar el SDK real.
const mockMap: { current: { setCenter: (p: unknown) => void } | null } = { current: null }
vi.mock('@vis.gl/react-google-maps', () => ({
  Map: ({ mapTypeId, children }: MockMapProps) => (
    <div data-testid="google-map" data-map-type={mapTypeId}>
      {children}
    </div>
  ),
  Marker: () => null,
  Polyline: () => null,
  useMap: () => mockMap.current,
}))

// Misma clave que el toggle de MapPicker (ver comentario en PlayMap.tsx junto
// a `LAYER_KEY`): se repite aquí literal a propósito, para que el test note si
// alguna vez cambia sin querer.
const LAYER_KEY = 'lg.mapLayer'

function noop() {}

describe('PlayMap — centerOn re-centra la vista (issue #789)', () => {
  beforeEach(() => {
    localStorage.clear()
    mockMap.current = null
  })

  // `guess={null}` a propósito en ambos renders: el pin del jugador construye su
  // icono con el namespace global `google` (Size/Point), que no existe en jsdom.
  // `centerOn` es independiente del pin — lo que se cubre aquí es el seguimiento
  // de la vista, no el marcador.
  test('con `centerOn`, centra el mapa en la coordenada (y la sigue si cambia)', () => {
    const setCenter = vi.fn()
    mockMap.current = { setCenter }
    const aim = { lat: 41.9, lng: 12.5 }

    const { rerender } = render(
      <PlayMap
        guess={null}
        answer={null}
        locked={false}
        onPick={noop}
        meUserId="u1"
        centerOn={aim}
      />,
    )
    expect(setCenter).toHaveBeenCalledWith(aim)

    const adjusted = { lat: 40.4, lng: -3.7 }
    rerender(
      <PlayMap
        guess={null}
        answer={null}
        locked={false}
        onPick={noop}
        meUserId="u1"
        centerOn={adjusted}
      />,
    )
    expect(setCenter).toHaveBeenLastCalledWith(adjusted)
  })

  test('sin `centerOn` no toca la vista (mapas interactivos: manda el jugador)', () => {
    const setCenter = vi.fn()
    mockMap.current = { setCenter }

    render(<PlayMap guess={null} answer={null} locked={false} onPick={noop} meUserId="u1" />)

    expect(setCenter).not.toHaveBeenCalled()
  })
})

describe('PlayMap — capa base satélite y toggle (issue #602)', () => {
  beforeEach(() => {
    localStorage.clear()
    mockMap.current = null
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
