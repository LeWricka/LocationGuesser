// Prefetch de chunks de ruta en ratos muertos (QW3). Las pantallas pesadas
// (viaje, jugar, crear) son `React.lazy` en App.tsx: Vite las separa en su
// propio chunk para no lastrar el arranque, pero eso significa que la PRIMERA
// vez que se navega a cada una paga el fetch entero antes de poder pintar. Como
// son, con diferencia, las rutas más transitadas desde la home, adelantamos su
// descarga en cuanto el hilo principal queda libre tras el primer render —
// nunca antes, para no competir con el arranque ni con datos que sí bloquean
// contenido.

/**
 * Dispara el `import()` de los chunks de las rutas principales cuando el
 * navegador esté ocioso (con respaldo en `setTimeout` para Safari, que no
 * implementa `requestIdleCallback`). Los `import()` quedan cacheados por el
 * propio bundler: cuando `React.lazy` los pida de verdad, ya están en caché
 * (o en vuelo) en vez de arrancar de cero.
 *
 * Devuelve una función de cancelación (issue #966): si el componente que la
 * llamó se desmonta ANTES de que el idle-callback/timeout dispare, el efecto
 * que la programó debe cancelarla — si no, el `prefetch()` puede ejecutarse
 * más tarde, con `window`/el entorno ya desmontados (exactamente lo que pasaba
 * en tests: `App.test.tsx` monta `<App/>` sin esperar este idle callback, y
 * tras el teardown de jsdom el `import()` de rutas con Leaflet revienta con
 * "window is not defined" porque el módulo lo toca en su carga top-level).
 */
export function prefetchMainRoutes(): () => void {
  const prefetch = () => {
    void import('../features/trip/TripPage')
    void import('../features/play/PlayChallenge')
    void import('../features/create/CreateGroup')
  }

  const ricWindow = window as typeof window & {
    requestIdleCallback?: (cb: () => void) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (typeof ricWindow.requestIdleCallback === 'function') {
    const handle = ricWindow.requestIdleCallback(prefetch)
    return () => ricWindow.cancelIdleCallback?.(handle)
  }
  const timer = setTimeout(prefetch, 1)
  return () => clearTimeout(timer)
}
