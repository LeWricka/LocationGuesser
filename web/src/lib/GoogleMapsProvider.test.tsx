import { describe, test, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GoogleMapsProvider } from './GoogleMapsProvider'
import { useMapsLibraryGuarded } from './mapsGuard'

// Robustez (issue #957, ampliado en #988): si el SDK de Google Maps falla al
// cargar (cuota, referrer mal configurado en la key, sin red, o se cuelga
// goteando) o si una librería SECUNDARIA (marker/streetView) falla tras cargar
// el script principal, el aviso con reintento debe sustituir a los hijos en
// vez de dejarlos montar sobre un `google.maps` roto/incompleto. `APIProvider`
// real necesita red + API key (no corre en test), así que lo sustituimos por
// un passthrough y controlamos `useApiLoadingStatus`/`useApiIsLoaded`/
// `useMapsLibrary` desde cada test.
const mockStatus = { current: 'LOADED' as string }
const mockApiLoaded = { current: true }
const mockLibrary = { current: null as unknown }
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
  useApiIsLoaded: () => mockApiLoaded.current,
  useMapsLibrary: () => mockLibrary.current,
}))

// Componente mínimo que representa a PlayMap/AllGuessesMap/StreetViewPano:
// pide una librería secundaria vigilada y solo se ve mientras nadie escaló un
// fallo (si el fallo se escala, `MapsLoadGuard` lo desmonta y pinta el banner).
function LibraryConsumer() {
  useMapsLibraryGuarded('marker')
  return <div data-testid="hijo">mapa</div>
}

afterEach(() => {
  vi.useRealTimers()
  mockStatus.current = 'LOADED'
  mockApiLoaded.current = true
  mockLibrary.current = null
})

describe('GoogleMapsProvider — robustez ante fallo de carga (issue #957/#988)', () => {
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

  test('si el script se queda colgado en LOADING, tras el tope muestra el aviso (caso real: bloqueador/DNS/roaming)', () => {
    vi.useFakeTimers()
    mockStatus.current = 'LOADING'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )
    expect(screen.getByTestId('hijo')).toBeInTheDocument()

    // Justo antes del tope: sigue sin aviso (no basta con "está tardando").
    act(() => void vi.advanceTimersByTime(11999))
    expect(screen.getByTestId('hijo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()

    // Pasado el tope: se da por colgado.
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('hijo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  test('si el script carga a tiempo, cancela el tope y NO muestra el aviso más tarde', () => {
    vi.useFakeTimers()
    mockStatus.current = 'LOADING'
    const { rerender } = render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )

    mockStatus.current = 'LOADED'
    rerender(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )

    // Sobra tiempo de margen: si el tope no se hubiera cancelado, esto pintaría el aviso.
    act(() => void vi.advanceTimersByTime(60000))
    expect(screen.getByTestId('hijo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  test('"Reintentar" recarga la página', () => {
    const reload = vi.fn()
    const original = window.location
    // @ts-expect-error: sustituimos `location` completo para espiar `reload()`.
    delete window.location
    // @ts-expect-error: doble mínimo, solo necesitamos `reload`.
    window.location = { ...original, reload }

    mockStatus.current = 'FAILED'
    render(
      <GoogleMapsProvider>
        <div data-testid="hijo">mapa</div>
      </GoogleMapsProvider>,
    )
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(reload).toHaveBeenCalledTimes(1)

    // @ts-expect-error: restauramos el `location` real sustituido arriba.
    window.location = original
  })

  test('si una librería secundaria (marker/streetView) no llega, escala al mismo aviso (issue #988, LOCATIONGUESSER-1J)', () => {
    vi.useFakeTimers()
    mockStatus.current = 'LOADED'
    mockApiLoaded.current = true
    mockLibrary.current = null // la librería nunca resuelve (fallo silencioso del SDK)

    render(
      <GoogleMapsProvider>
        <LibraryConsumer />
      </GoogleMapsProvider>,
    )
    expect(screen.getByTestId('hijo')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(9999))
    expect(screen.getByTestId('hijo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('hijo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  test('si la librería secundaria llega a tiempo, no escala ningún aviso', () => {
    vi.useFakeTimers()
    mockStatus.current = 'LOADED'
    mockApiLoaded.current = true
    mockLibrary.current = { ok: true }

    render(
      <GoogleMapsProvider>
        <LibraryConsumer />
      </GoogleMapsProvider>,
    )

    act(() => void vi.advanceTimersByTime(60000))
    expect(screen.getByTestId('hijo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })
})
