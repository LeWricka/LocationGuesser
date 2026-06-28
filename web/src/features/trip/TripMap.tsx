import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react'
import type { TripMapProps as Props } from './TripMap.types'
import { TripMapLeaflet } from './TripMapLeaflet'
import styles from './TripMap.module.css'

// El globo (MapLibre, WebGL, ~pesado) entra por import dinámico → su propio chunk;
// nunca lastra el bundle inicial. El plano (Leaflet) es síncrono: es la red de
// seguridad y debe estar SIEMPRE disponible al instante.
const TripMapGlobe = lazy(() => import('./TripMapGlobe').then((m) => ({ default: m.TripMapGlobe })))

/**
 * ¿Soporta el navegador WebGL? Lo necesita el globo (MapLibre dibuja en WebGL).
 * Creamos un canvas de usar y tirar y pedimos un contexto 'webgl2'/'webgl'. Si el
 * navegador no lo da (móvil viejo, GPU bloqueada, WebGL desactivado) devolvemos
 * false y ni intentamos cargar MapLibre: vamos directos al plano.
 */
function hasWebGL(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return gl != null
  } catch {
    // Algunos navegadores lanzan al pedir el contexto si WebGL está bloqueado.
    return false
  }
}

/**
 * Error boundary que cae al mapa plano si el globo revienta en runtime (fallo al
 * importar MapLibre, error al crear el mapa, WebGL que se pierde…). Un fallo del
 * "hero" NUNCA debe tumbar la pantalla Viaje: el plano cubre con los mismos pines.
 */
class GlobeErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

/**
 * SELECTOR del mapa de Viaje. Mismo contrato de Props que ambos motores:
 *  - si hay WebGL → intenta el GLOBO 3D (MapLibre, import dinámico);
 *  - si no hay WebGL, o el globo falla al cargar/inicializarse → MAPA PLANO
 *    (Leaflet), que es la red de seguridad garantizada.
 *
 * Mientras el chunk del globo carga, mostramos el plano de fondo (vía Suspense
 * fallback): cero pantalla en blanco y, si el globo nunca llega, igual se ve el
 * viaje. El globo es un STRETCH; el plano manda.
 */
export function TripMap(props: Props) {
  // Una sola decisión por montaje (no recalcular en cada render).
  const webgl = useMemo(() => hasWebGL(), [])

  if (!webgl) return <TripMapLeaflet {...props} />

  const flat = <TripMapLeaflet {...props} />

  return (
    <GlobeErrorBoundary fallback={flat}>
      {/* Mientras baja el chunk del globo, fondo océano (no pantalla en blanco ni un
          Leaflet de usar y tirar). Si el globo falla, el boundary cae al plano. */}
      <Suspense fallback={<div className={styles.loading} />}>
        <TripMapGlobe {...props} />
      </Suspense>
    </GlobeErrorBoundary>
  )
}
