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
import { APILoadingStatus, APIProvider, useApiLoadingStatus } from '@vis.gl/react-google-maps'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'

interface Props {
  children: ReactNode
}

// Clave pública (restringida por dominio) para Maps/Street View.
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Robustez (issue #957): si el script del SDK falla (cuota agotada, referrer
// mal configurado en la key, o simplemente sin red) el resto de la app NO debe
// quedar con un mapa a medio pintar ni crashear al construir `google.maps.*`
// (los componentes de mapa ya se protegen con `useApiIsLoaded`, ver PlayMap/
// AllGuessesMap) — aquí cubrimos el caso "nunca llegó a cargar" con un aviso y
// un reintento explícito. Recargar la página es la vía más simple y fiable de
// reintentar: el loader de `@vis.gl/react-google-maps` inserta el <script> una
// única vez por documento, así que un componente que solo remonte el
// `<APIProvider>` no vuelve a pedirlo.
function MapsLoadGuard({ children }: Props) {
  const status = useApiLoadingStatus()
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <Banner
        tone="aviso"
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        }
      >
        No se pudo cargar el mapa. Comprueba tu conexión y reintenta.
      </Banner>
    )
  }
  return <>{children}</>
}

export function GoogleMapsProvider({ children }: Props) {
  return (
    <APIProvider apiKey={mapsApiKey}>
      <MapsLoadGuard>{children}</MapsLoadGuard>
    </APIProvider>
  )
}
