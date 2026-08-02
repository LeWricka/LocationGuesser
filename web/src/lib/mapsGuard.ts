// Guardia de librerías de Google Maps (issue #988, Sentry LOCATIONGUESSER-1J).
// Contexto + hooks en un `.ts` propio (sin JSX) siguiendo el patrón del repo
// (toast-context.ts / overlayBack.ts): `react-refresh` exige que los ficheros
// de componentes solo exporten componentes, y estos hooks los consumen ficheros
// de mapa (PlayMap/AllGuessesMap/StreetViewPano) además del propio provider.
//
// El problema que cubre: `useMapsLibrary('marker'|'streetView')` IGNORA el
// rechazo de su promesa — si esa librería secundaria no llega (bloqueador de
// anuncios, DNS privado, roaming, navegador embebido), el valor se queda en
// `null` para siempre sin ninguna señal, con el SDK principal ya cargado. El
// tope de espera convierte ese silencio en el MISMO banner degradado
// ("No se pudo cargar el mapa · Reintentar") que un fallo del script principal.

import { createContext, useContext, useEffect } from 'react'
import { useApiIsLoaded, useMapsLibrary } from '@vis.gl/react-google-maps'
import { reportSilentWarning } from './observability'

// Tope para librerías SECUNDARIAS una vez el script principal ya cargó.
export const LIBRARY_TIMEOUT_MS = 10000

// Consumidores (PlayMap/AllGuessesMap/StreetViewPano) usan esto para escalar el
// fallo de una librería secundaria al MISMO banner degradado que un fallo del
// script principal — un solo estado visible, no un aviso distinto por mapa.
// Lo provee `MapsLoadGuard` (GoogleMapsProvider.tsx).
export const MapsFailureContext = createContext<(() => void) | null>(null)

/**
 * Señala que una librería secundaria de Maps (marker/streetView/…) no cargó;
 * fuerza el mismo banner "No se pudo cargar el mapa · Reintentar" que un fallo
 * del script principal. No-op fuera de un `<GoogleMapsProvider>` (tests
 * aislados, Storybook…) — no hay banner al que escalar.
 */
export function useReportMapsLibraryFailure(): () => void {
  const report = useContext(MapsFailureContext)
  return report ?? (() => {})
}

/**
 * `useMapsLibrary` con red de seguridad (issue #988): si el script principal
 * ya cargó (`useApiIsLoaded`) pero esta librería concreta no resuelve en
 * `LIBRARY_TIMEOUT_MS`, se trata como un fallo — se avisa (breadcrumb, no
 * excepción: es ambiental) y se escala al banner degradado del provider.
 * Cancela el tope en cuanto la librería llega o el componente se desmonta.
 *
 * Overloads: preservan el tipo concreto que `useMapsLibrary` devuelve por
 * nombre de librería (el wrapper genérico lo degradaría a la unión completa).
 */
export function useMapsLibraryGuarded(name: 'marker'): google.maps.MarkerLibrary | null
export function useMapsLibraryGuarded(name: 'streetView'): google.maps.StreetViewLibrary | null
export function useMapsLibraryGuarded(
  name: Parameters<typeof useMapsLibrary>[0],
): ReturnType<typeof useMapsLibrary> {
  const library = useMapsLibrary(name)
  const apiLoaded = useApiIsLoaded()
  const reportFailure = useReportMapsLibraryFailure()

  useEffect(() => {
    if (!apiLoaded || library) return
    const timer = setTimeout(() => {
      reportSilentWarning('maps_library_load_timeout', { library: name })
      reportFailure()
    }, LIBRARY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [apiLoaded, library, reportFailure, name])

  return library
}
