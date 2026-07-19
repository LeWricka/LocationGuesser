import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './ui'
import { RootErrorBoundary } from './lib/RootErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { initObservability, reportSilentWarning } from './lib/observability'
import { applyCleanRoute } from './lib/cleanRoute'
import { isSafeUpdateRoute } from './lib/safeUpdateRoute'
import { shouldReloadOnPreloadError } from './lib/reloadOnPreloadError'
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

// #761: cada deploy cambia los hashes de los assets (chunks JS/CSS). Un
// cliente con el `index.html` viejo en una pestaña ya abierta pide un chunk
// que ya no existe → Vite lo detecta y dispara `vite:preloadError`
// ("Failed to fetch dynamically imported module" — LOCATIONGUESSER-H;
// "Unable to preload CSS" — LOCATIONGUESSER-J). `event.preventDefault()`
// evita que ese rechazo se propague como error sin manejar (lo que hoy llega
// a Sentry); recargamos para traer el `index.html` nuevo con los hashes
// correctos. Guard de una recarga por sesión (`shouldReloadOnPreloadError`,
// puro y testeado aparte): si tras recargar el error VUELVE, no es un desfase
// de deploy sino un fallo real — dejamos que fluya en vez de ciclar recargas.
window.addEventListener('vite:preloadError', (event) => {
  if (!shouldReloadOnPreloadError(sessionStorage)) return
  event.preventDefault()
  window.location.reload()
})

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
// formularios de crear reto/momento; hubo 18 deploys en una noche). Solo hay
// una vía, SILENCIOSA: `visibilitychange` a `document.hidden` → aplicamos ya.
// Nadie está mirando esta pestaña (la minimizó, cambió de app/pestaña); al
// volver verá la versión nueva sin haber notado nada. `updateSW(true)` es
// no-op si no hay actualización pendiente, así que este listener puede vivir
// siempre. Mientras la pestaña siga visible, la actualización queda pendiente
// sin avisar a nadie (#819 retiró el banner "Hay una versión nueva ·
// Actualizar": en el escritorio, único caso donde la pestaña podía quedar
// visible horas, el coste de fricción del aviso superaba su valor — el móvil,
// plataforma dominante, ya se resolvía solo con esta vía silenciosa).
// No-op en dev (SW desactivado) y en tests (este entrypoint no se importa). El
// módulo `virtual:pwa-register` lo provee vite-plugin-pwa en build.
//
// #647: esta vía tenía un agujero — hoy, con la cadencia de deploys, casi
// SIEMPRE hay una actualización pendiente, así que CADA vuelta al navegador
// (ocultar y volver a mostrar la pestaña) dispara la recarga silenciosa. Si el
// usuario salió a mitad de un FORMULARIO (crear reto/momento, editar perfil…)
// o de una PARTIDA en curso, esa recarga se lo lleva por delante. Ahora solo
// aplica si `location.hash` es una ruta "segura" (`isSafeUpdateRoute`, en
// `lib/safeUpdateRoute.ts`); si no, la actualización queda pendiente hasta que
// el usuario navegue a una ruta segura y luego oculte la pestaña.
const SW_UPDATE_INTERVAL_MS = 60_000

// Recarga como mucho una vez, dispare quien dispare (el `controllerchange` real
// o el cinturón de más abajo).
let reloaded = false
function reloadOnce() {
  if (reloaded) return
  reloaded = true
  window.location.reload()
}

// Solo `true` entre que `onNeedRefresh` avisa de un SW en espera y que lo
// aplicamos: evita armar el listener/timeout de recarga de más abajo en cada
// cambio de pestaña si no hay ninguna actualización pendiente.
let updateAvailable = false

// CAUSA RAÍZ (#627 — "pastilla aparece, Actualizar no hace nada"): el reload
// automático de `virtual:pwa-register` (workbox-window) depende de un flag
// `isUpdate` que se fija UNA SOLA VEZ, al registrar el SW, según si
// `navigator.serviceWorker.controller` YA existía en ese instante. En la
// PRIMERA visita de la sesión ese controller es `null` (aún no hay SW
// controlando la pestaña) — y ese flag queda `false` PARA SIEMPRE en esa
// instancia, incluida cualquier actualización detectada horas después con la
// MISMA pestaña abierta (el caso normal de Tabide: varios días de viaje sin
// recargar). El SW nuevo SÍ toma el control (`clientsClaim` en sw.ts + el
// `controllerchange` SÍ llega — verificado), pero el listener interno de la
// librería nunca dispara el reload porque comprueba ese flag congelado en
// `false`. Reproducido con Playwright (build A → preview → build B → tap
// "Actualizar" en la primera visita, sin recargar entremedias): el título
// nunca cambiaba a pesar de que `navigator.serviceWorker.controller` ya
// apuntaba al SW nuevo.
//
// Arreglo: no delegamos el reload en ese flag ajeno. Escuchamos
// `controllerchange` NOSOTROS, armado justo al decidir aplicar la
// actualización — si llega después de eso es, por construcción, la
// actualización que acabamos de pedir (acabamos de mandar `SKIP_WAITING`), así
// que recargamos siempre. CINTURÓN: si a los 1.5 s no ha llegado (algún user
// agent no lo entrega de forma fiable — el caso que motivó pedirlo en el
// issue), recargamos igual: más vale una recarga de más que un "Actualizar"
// que no hace nada.
function applyUpdate() {
  updateAvailable = false
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true })
  setTimeout(reloadOnce, 1500)
  void updateSW(true)
}

// #761: el registro/actualización del SW es mejora progresiva (#237 pendiente)
// — si falla, la app funciona igual sin él. `registration.update()` se
// llamaba con `void`, que descarta el VALOR de la promesa pero NO atrapa su
// rechazo: un `update()` fallido (fetch de sw.js caído, 403 transitorio en
// ventana de deploy…) se convertía en un rechazo SIN MANEJAR, capturado por
// los global handlers de Sentry como error (LOCATIONGUESSER-S "Failed to
// update a ServiceWorker..."). Mismo origen para el registro inicial
// (LOCATIONGUESSER-Y "Script sw.js load failed"): sin `onRegisterError`,
// vite-plugin-pwa lo atrapa pero no hacíamos nada con él. Ambos casos quedan
// ahora en un warning de consola + breadcrumb de Sentry, nunca `captureException`.
function reportSwNoise(error: unknown): void {
  console.warn('[sw] registro/actualización falló (mejora progresiva, no crítico):', error)
  reportSilentWarning('sw_register_or_update_failed', {
    error: error instanceof Error ? error.message : String(error),
  })
}

// Aplicación EN EL ARRANQUE (19-jul): el retardo de 5 min al ocultar protege el
// scroll/estado de una sesión viva, pero convertía cada apertura en "voy una
// versión por detrás" (con la cadencia real de deploys, el dueño nunca veía lo
// último sin borrar datos). El arranque es el único momento GRATIS para
// recargar: aún no hay scroll, ni partida, ni formulario que perder. Si hay una
// actualización esperando (de la sesión anterior) o se detecta en los primeros
// segundos de vida de la página, se aplica YA — una recarga única e invisible al
// abrir. Solo en rutas seguras (jugar/crear siguen intocables) y sin riesgo de
// bucle: tras recargar, el SW nuevo controla y no queda nada en espera.
const BOOT_APPLY_WINDOW_MS = 10_000
const bootedAt = Date.now()
function bootApplyIfFresh(): boolean {
  if (Date.now() - bootedAt > BOOT_APPLY_WINDOW_MS) return false
  if (!isSafeUpdateRoute(window.location.hash)) return false
  applyUpdate()
  return true
}

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // Un SW ya EN ESPERA de la sesión anterior no siempre re-dispara
    // onNeedRefresh: se comprueba aquí explícitamente al registrar.
    if (registration.waiting) bootApplyIfFresh()
    setInterval(() => void registration.update().catch(reportSwNoise), SW_UPDATE_INTERVAL_MS)
  },
  onRegisterError: reportSwNoise,
  onNeedRefresh() {
    if (bootApplyIfFresh()) return
    updateAvailable = true
    // La pestaña ya está oculta (p.ej. el sondeo de 60 s la encontró mientras el
    // usuario estaba en otra app): programamos la aplicación con el MISMO retardo
    // que el listener de visibilidad — aplicar al instante convertía una ausencia
    // de segundos en una recarga (reporte del dueño, 4 jul). Si sigue visible, no
    // hacemos nada más: la actualización queda pendiente hasta que se oculte.
    if (document.hidden) scheduleHiddenApply()
  },
})

// Aplica la actualización pendiente cuando el usuario lleva un rato SIN mirar la
// pestaña. El "un rato" importa (reporte del dueño, 4 jul): con la cadencia real
// de deploys casi siempre hay una actualización esperando, y aplicar nada más
// ocultarse convertía CADA salto a otra app (contestar un WhatsApp y volver) en
// una recarga — pérdida de scroll y de dónde estabas. Con el retardo, los saltos
// cortos no recargan nunca; las ausencias de verdad (donde la recarga sí es
// invisible) siguen actualizando solas. Solo en rutas seguras (#647); en el
// resto la actualización queda pendiente hasta que el usuario navegue a una
// ruta segura y vuelva a ocultar la pestaña.
const HIDDEN_APPLY_DELAY_MS = 5 * 60_000
let hiddenApplyTimer: ReturnType<typeof setTimeout> | null = null
function scheduleHiddenApply() {
  if (hiddenApplyTimer != null) return
  hiddenApplyTimer = setTimeout(() => {
    hiddenApplyTimer = null
    // Re-comprobar al disparar: pudo volver a primer plano, navegar a una ruta
    // no segura, o haberse aplicado ya por la pastilla manual.
    if (document.hidden && updateAvailable && isSafeUpdateRoute(window.location.hash)) {
      applyUpdate()
    }
  }, HIDDEN_APPLY_DELAY_MS)
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && hiddenApplyTimer != null) {
    // Volvió antes del retardo: el salto fue corto, no se recarga nada.
    clearTimeout(hiddenApplyTimer)
    hiddenApplyTimer = null
    return
  }
  if (document.hidden && updateAvailable && isSafeUpdateRoute(window.location.hash)) {
    scheduleHiddenApply()
  }
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
