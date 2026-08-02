// Provider del SDK de Google Maps (Street View / mapa satélite), aislado del
// arranque de la app. ANTES vivía en main.tsx envolviendo TODA la app, así que la
// landing descargaba el SDK (~215 KiB) sin usarlo nunca. Ahora App lo monta SOLO
// alrededor de las rutas que de verdad usan Maps/Street View (jugar, crear,
// viaje/grupo); la landing y la home no lo cargan.
//
// `@vis.gl/react-google-maps` gestiona la carga del SDK; las features usan
// `useMapsLibrary`/`useMap` cuando lo necesitan, y para eso basta con tener este
// <APIProvider> como ancestro.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { APILoadingStatus, APIProvider, useApiLoadingStatus } from '@vis.gl/react-google-maps'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { reportSilentWarning } from './observability'
import { MapsFailureContext } from './mapsGuard'
import styles from './GoogleMapsProvider.module.css'

interface Props {
  children: ReactNode
}

// Clave pública (restringida por dominio) para Maps/Street View.
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Cuánto esperamos en LOADING antes de darlo por colgado (issue #988, Sentry
// LOCATIONGUESSER-1J). Caso real: a algunos jugadores (bloqueador de anuncios,
// DNS privado, roaming, navegador embebido de WhatsApp) el script de Google
// Maps se queda goteando en LOADING para siempre — `status` nunca llega a
// FAILED/AUTH_FAILURE (los únicos casos que cubría el banner del #957), así
// que el spinner/skeleton no tenía salida. Pasado este tope tratamos LOADING
// prolongado como un fallo más.
const LOAD_TIMEOUT_MS = 12000

// El tope de librerías SECUNDARIAS ('marker'/'streetView' que fallan DESPUÉS de
// que el script principal cargue — invisible para el guard de status) vive en
// `mapsGuard.ts` (`useMapsLibraryGuarded`), fichero aparte por `react-refresh`;
// aquí solo se PROVEE el contexto que escala esos fallos al banner de abajo.

// Robustez (issue #957, ampliado en #988): si el script del SDK falla (cuota
// agotada, referrer mal configurado en la key, sin red, o se cuelga goteando)
// el resto de la app NO debe quedar con un mapa a medio pintar ni crashear al
// construir `google.maps.*` (los componentes de mapa ya se protegen con
// `useApiIsLoaded`, ver PlayMap/AllGuessesMap) — aquí cubrimos "nunca llegó a
// cargar" (script o librería) con un aviso y un reintento explícito. Recargar
// la página es la vía más simple y fiable de reintentar: el loader de
// `@vis.gl/react-google-maps` inserta el <script> una única vez por documento,
// así que un componente que solo remonte el `<APIProvider>` no vuelve a pedirlo.
function MapsLoadGuard({ children }: Props) {
  const status = useApiLoadingStatus()
  const [timedOut, setTimedOut] = useState(false)
  const [libraryFailed, setLibraryFailed] = useState(false)

  useEffect(() => {
    if (status !== APILoadingStatus.LOADING) return
    const timer = setTimeout(() => {
      reportSilentWarning('maps_load_timeout')
      setTimedOut(true)
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status])

  const reportLibraryFailure = useCallback(() => setLibraryFailed(true), [])

  const failed =
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE ||
    timedOut ||
    libraryFailed

  if (failed) {
    return (
      <Banner
        tone="aviso"
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        }
      >
        <p className={styles.title}>No se pudo cargar el mapa</p>
        <p className={styles.hint}>
          Revisa bloqueadores de anuncios o DNS privado, o prueba con otra red o navegador.
        </p>
      </Banner>
    )
  }

  return (
    <MapsFailureContext.Provider value={reportLibraryFailure}>
      {children}
    </MapsFailureContext.Provider>
  )
}

export function GoogleMapsProvider({ children }: Props) {
  return (
    <APIProvider apiKey={mapsApiKey}>
      <MapsLoadGuard>{children}</MapsLoadGuard>
    </APIProvider>
  )
}
