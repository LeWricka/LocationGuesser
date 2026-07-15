// Guard puro para #761: decide si `main.tsx` debe recargar tras un
// `vite:preloadError` o dejar que el error fluya. Puro (recibe el storage) para
// poder testearlo sin levantar todo el entrypoint.
//
// Cada deploy cambia los hashes de los assets (chunks JS/CSS). Un cliente con
// el `index.html` viejo en una pestaña ya abierta (o servido desde caché de
// navegación) pide un chunk que ya no existe: Vite lo detecta y dispara
// `vite:preloadError` en `window` ("Failed to fetch dynamically imported
// module" — LOCATIONGUESSER-H; "Unable to preload CSS" — LOCATIONGUESSER-J).
// Recargar trae el `index.html` nuevo con los hashes correctos y arregla el
// caso normal.
//
// Guard de UNA recarga por sesión (sessionStorage, sobrevive a la propia
// recarga: no se resetea al recargar la misma pestaña, solo al cerrarla). Si
// tras recargar el error VUELVE a aparecer, no es un desfase de deploy sino un
// fallo real (red caída, CDN roto, bloqueador de contenido) — dejamos que el
// error fluya en vez de entrar en un bucle de recargas.
const STORAGE_KEY = 'lg:reload-on-preload-error'

/**
 * `true` la primera vez que se llama en la sesión (y marca el guard para que
 * las siguientes llamadas devuelvan `false`). El llamador debe recargar solo
 * cuando devuelve `true`.
 */
export function shouldReloadOnPreloadError(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  if (storage.getItem(STORAGE_KEY)) return false
  storage.setItem(STORAGE_KEY, '1')
  return true
}
