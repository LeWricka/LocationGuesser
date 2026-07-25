// Guardia anti-bucle para la recarga que APLICA una actualización del service
// worker (issue #948). Gemela de `shouldReloadForChunkError` (`chunkReload.ts`):
// el auto-actualizador de la PWA (`main.tsx`) recarga la página para que el SW
// nuevo tome el control. Si esa recarga se dispara ANTES de que la activación
// del SW nuevo complete (móvil/4G: el cinturón de 1,5 s recarga aunque no haya
// llegado `controllerchange`), al recargar el SW sigue EN ESPERA y `bootedAt` se
// reinicia (ventana de boot fresca cada carga) → se vuelve a aplicar → recarga
// → BUCLE INFINITO. A diferencia de `chunkReload`, esta recarga no tenía guardia
// entre recargas.
//
// Esta guardia, persistida en `sessionStorage`, corta el bucle: si ya recargamos
// por este motivo hace menos de la ventana, NO recargamos otra vez — la app
// renderiza con el código actual (funciona; a lo sumo una versión por detrás
// hasta la próxima apertura) en vez de ciclar recargas.

const STORAGE_KEY = 'lg:sw-update-reloaded'

// Ventana anti-bucle. MAYOR que la de `chunkReload` (10 s): activar un SW nuevo
// en móvil es más lento que re-pedir un chunk, así que damos más margen a que
// una recarga legítima complete antes de considerar que estamos en bucle.
export const SW_RELOAD_WINDOW_MS = 20_000

/**
 * Guard puro: `true` la primera vez (o si la última recarga por actualización
 * del SW fue hace más de `SW_RELOAD_WINDOW_MS`), y en ese caso deja la marca con
 * el timestamp actual. `false` si ya recargamos hace poco (no toca la marca: el
 * bloqueo cuenta desde la recarga real, no se alarga con reintentos). Misma
 * forma que `shouldReloadForChunkError`.
 */
export function shouldReloadForSwUpdate(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now: number = Date.now(),
): boolean {
  const last = storage.getItem(STORAGE_KEY)
  if (last !== null && now - Number(last) < SW_RELOAD_WINDOW_MS) return false
  storage.setItem(STORAGE_KEY, String(now))
  return true
}
