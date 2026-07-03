import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider, UpdateBanner } from './ui'
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
// cacheada (síntoma: seguía viendo la landing vieja). El sondeo se MANTIENE (era el
// objetivo de #498); lo que cambia (#549) es qué hacemos al encontrar versión nueva:
// registerType 'prompt' + sw.ts YA NO hace skipWaiting incondicional, así que el SW
// nuevo se queda EN ESPERA hasta que lo apliquemos explícitamente con `updateSW(true)`
// — nunca se auto-activa ni recarga la pestaña sin que decidamos cuándo.
//
// "Cuándo": NUNCA con el usuario activo mirando la pantalla a medio formulario
// (#498 → #549: un deploy recargaba TODAS las pestañas de golpe y se perdían
// formularios de crear reto/momento; hubo 18 deploys en una noche). Dos vías:
//   (a) SILENCIOSA: `visibilitychange` a `document.hidden` → aplicamos ya. Nadie
//       está mirando esta pestaña (la minimizó, cambió de app/pestaña); al volver
//       verá la versión nueva sin haber notado nada. `updateSW(true)` es no-op si
//       no hay actualización pendiente, así que este listener puede vivir siempre.
//   (b) EXPLÍCITA: si la pestaña sigue visible cuando llega la versión nueva,
//       mostramos el banner "Hay una versión nueva · Actualizar" (ver
//       UpdateBanner más abajo) y esperamos a que el usuario decida.
// No-op en dev (SW desactivado) y en tests (este entrypoint no se importa). El
// módulo `virtual:pwa-register` lo provee vite-plugin-pwa en build.
const SW_UPDATE_INTERVAL_MS = 60_000

// El banner vive en su PROPIO root de React, fuera del árbol de `<App/>`: en este
// punto del arranque aún no existe ningún componente de producto (ni ToastProvider
// con soporte de acción persistente) al que engancharlo, y montarlo aquí evita
// tocar App.tsx/ToastProvider por un aviso que solo aparece tras un deploy. Es
// idempotente (no se duplica si `onNeedRefresh` se dispara más de una vez).
let updateBannerMounted = false
function showUpdateBanner(onUpdate: () => void) {
  if (updateBannerMounted) return
  updateBannerMounted = true
  const container = document.createElement('div')
  container.id = 'update-banner-root'
  document.body.appendChild(container)
  createRoot(container).render(<UpdateBanner onUpdate={onUpdate} />)
}

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => void registration.update(), SW_UPDATE_INTERVAL_MS)
  },
  onNeedRefresh() {
    // La pestaña ya está oculta (p.ej. el sondeo de 60 s la encontró mientras el
    // usuario estaba en otra app): nadie mira, la aplicamos ya en vez de esperar
    // a que vuelva y le salte el banner de sorpresa.
    if (document.hidden) void updateSW(true)
    else showUpdateBanner(() => void updateSW(true))
  },
})

// Aplica la actualización pendiente en cuanto el usuario deja de mirar la pestaña
// (la minimiza, cambia de pestaña o de app): el momento en que una recarga es
// invisible para él. No-op si no hay SW en espera.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void updateSW(true)
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
