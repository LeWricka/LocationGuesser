/* eslint-disable react-refresh/only-export-components -- este stub debe espejar la
   superficie del paquete real (@vis.gl/react-google-maps), que mezcla componentes y
   hooks en el mismo módulo; el HMR no aplica a un doble de galería. */
// Stub de @vis.gl/react-google-maps para la galería (alias de Vite SOLO en el entry
// de galería). Evita cargar el SDK de Google Maps (red + API key) y lo sustituye por
// un lienzo determinista: <Map> pinta un área de "escena" gris-pizarra y los
// <Marker>/<Polyline> NO se dibujan (no hay proyección), pero el LAYOUT alrededor
// del mapa (overlays, hojas, botones) se ve igual. useMap/useMapsLibrary devuelven
// null, que es lo que las pantallas esperan mientras el SDK "aún no cargó".

import type { CSSProperties, ReactNode } from 'react'

interface MapProps {
  children?: ReactNode
  style?: CSSProperties
  className?: string
}

export function APIProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export function Map({ children, style, className }: MapProps) {
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, #2f4a63, #16222e)',
        ...style,
      }}
      data-gallery-map-stub
    >
      {children}
    </div>
  )
}

// Marcadores y líneas: sin proyección real no tienen posición fiable, así que no
// se dibujan (devolvemos null). El valor de la captura está en el chrome alrededor.
export function Marker(): null {
  return null
}
export function Polyline(): null {
  return null
}
export function AdvancedMarker(): null {
  return null
}

export function useMap(): null {
  return null
}
export function useMapsLibrary(): null {
  return null
}
