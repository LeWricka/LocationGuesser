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
 */
export function prefetchMainRoutes(): void {
  const prefetch = () => {
    void import('../features/trip/TripPage')
    void import('../features/play/PlayChallenge')
    void import('../features/create/CreateGroup')
  }

  const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof ric === 'function') ric(prefetch)
  else setTimeout(prefetch, 1)
}
