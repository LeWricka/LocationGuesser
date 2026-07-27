import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GoogleMapsProvider } from './GoogleMapsProvider'

// Robustez (issue #957): si el SDK de Google Maps falla al cargar (cuota,
// referrer mal configurado en la key, o sin red) el aviso con reintento debe
// sustituir a los hijos en vez de dejarlos montar sobre un `google.maps`
// inexistente. `APIProvider` real necesita red + API key (no corre en test),
// así que lo sustituimos por un passthrough y controlamos `useApiLoadingStatus`
// desde cada test.
const mockStatus = { current: 'LOADED' as string }
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  APILoadingStatus: {
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    LOADED: 'LOADED',
    FAILED: 'FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
  },
  useApiLoadingStatus: () => mockStatus.current,
}))

describe('GoogleMapsProvider — robustez ante fallo de carga (issue #957)', () => {
  test('con el SDK cargando/cargado, renderiza a los hijos con normalidad', () => {
    mockStatus.current = 'LOADING'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )
    expect(screen.getByTestId('hijo')).toBeInTheDocument()

    mockStatus.current = 'LOADED'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo-2">mapa</div>
      </GoogleMapsProvider>,
    )
    expect(screen.getByTestId('hijo-2')).toBeInTheDocument()
  })

  test('si el SDK falla (FAILED), muestra el aviso con reintento en vez de los hijos', () => {
    mockStatus.current = 'FAILED'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )
    expect(screen.queryByTestId('hijo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  test('si la key está mal configurada (AUTH_FAILURE), también muestra el aviso', () => {
    mockStatus.current = 'AUTH_FAILURE'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )
    expect(screen.queryByTestId('hijo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
