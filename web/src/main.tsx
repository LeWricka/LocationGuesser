import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@sentry/react'
import { APIProvider } from '@vis.gl/react-google-maps'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './ui'
import { initAnalytics } from './lib/analytics'
import { initObservability } from './lib/observability'
import { applyCleanRoute } from './lib/cleanRoute'

// Rutas limpias (`/v/<code>`, `/j/<code>`) → hash que ya enruta la app. Lo
// lanzamos sin bloquear el montaje: la app pinta la landing mientras se resuelve
// y el `hashchange` que dispara repinta al destino. No-op si la URL ya trae hash
// (enlace viejo) o no es una ruta limpia.
void applyCleanRoute()

// Clave pública (restringida por dominio) para Maps/Street View. El APIProvider
// gestiona la carga del SDK; las features usan useMapsLibrary cuando lo necesitan.
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Observabilidad + analítica: init idempotente antes de montar la app (no-op en
// tests, sin DSN/token o con la analítica desactivada por env).
initObservability()
initAnalytics()

// Fallback amable cuando un error de render escapa hasta la raíz: la app no se
// queda en blanco; ofrece recargar (lo más simple y efectivo para el usuario).
// JSX inline (no un componente nombrado en este entrypoint) para no chocar con
// react-refresh/only-export-components.
const crashFallback = (
  <main className="lg-page">
    <h1>Algo ha fallado</h1>
    <p>Lo sentimos, ha ocurrido un error inesperado. Prueba a recargar la página.</p>
    <button type="button" onClick={() => window.location.reload()}>
      Recargar
    </button>
  </main>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={crashFallback}>
      <APIProvider apiKey={mapsApiKey}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </APIProvider>
    </ErrorBoundary>
  </StrictMode>,
)
