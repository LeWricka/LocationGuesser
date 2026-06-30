// Provider del SDK de Google Maps (Street View / mapa satélite), aislado del
// arranque de la app. ANTES vivía en main.tsx envolviendo TODA la app, así que la
// landing descargaba el SDK (~215 KiB) sin usarlo nunca. Ahora App lo monta SOLO
// alrededor de las rutas que de verdad usan Maps/Street View (jugar, crear,
// viaje/grupo); la landing y la home no lo cargan.
//
// `@vis.gl/react-google-maps` gestiona la carga del SDK; las features usan
// `useMapsLibrary`/`useMap` cuando lo necesitan, y para eso basta con tener este
// <APIProvider> como ancestro.

import type { ReactNode } from 'react'
import { APIProvider } from '@vis.gl/react-google-maps'

interface Props {
  children: ReactNode
}

// Clave pública (restringida por dominio) para Maps/Street View.
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export function GoogleMapsProvider({ children }: Props) {
  return <APIProvider apiKey={mapsApiKey}>{children}</APIProvider>
}
