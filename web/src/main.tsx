import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APIProvider } from '@vis.gl/react-google-maps'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './ui'
import { initAnalytics } from './lib/analytics'

// Clave pública (restringida por dominio) para Maps/Street View. El APIProvider
// gestiona la carga del SDK; las features usan useMapsLibrary cuando lo necesitan.
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Analítica: init idempotente antes de montar la app (no-op en tests/sin token).
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <APIProvider apiKey={mapsApiKey}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </APIProvider>
  </StrictMode>,
)
