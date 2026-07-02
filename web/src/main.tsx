import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './ui'
import { RootErrorBoundary } from './lib/RootErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { initObservability } from './lib/observability'
import { applyCleanRoute } from './lib/cleanRoute'
import { registerSW } from 'virtual:pwa-register'

// Observabilidad + analítica: init idempotente antes de montar la app (no-op en
// tests, sin DSN/token o con la analítica desactivada por env). VAN PRIMERO: así
// `applyCleanRoute` puede emitir `share_link_opened` (la recepción del enlace) con
// la analítica ya inicializada en vez de hacer un no-op.
initObservability()
initAnalytics()

// Rutas limpias (`/v/<code>`, `/j/<code>`) → hash que ya enruta la app. Lo
// lanzamos sin bloquear el montaje: la app pinta la landing mientras se resuelve
// y el `hashchange` que dispara repinta al destino. No-op (de reescritura) si la
// URL ya trae hash (enlace viejo) o no es una ruta limpia; aun así mide la
// recepción del enlace.
void applyCleanRoute()

// PWA: registra el service worker y SONDEA actualizaciones cada 60 s. Tabide es un
// SPA (no navega entre páginas), así que sin este sondeo el navegador no detecta un
// deploy nuevo hasta una recarga manual y el usuario se queda en la versión
// cacheada (síntoma: seguía viendo la landing vieja). Con `registerType:'autoUpdate'`
// + `skipWaiting`/`clientsClaim` del SW, al detectar versión nueva el SW toma el
// control y la página se refresca sola. No-op en dev (SW desactivado) y en tests
// (este entrypoint no se importa). El módulo `virtual:pwa-register` lo provee
// vite-plugin-pwa en build.
const SW_UPDATE_INTERVAL_MS = 60_000
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => void registration.update(), SW_UPDATE_INTERVAL_MS)
  },
})

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
    <RootErrorBoundary fallback={crashFallback}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
