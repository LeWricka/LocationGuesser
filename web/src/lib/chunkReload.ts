// Recarga automática cuando falla la carga de un chunk viejo tras un deploy
// (issue #926, Sentry LOCATIONGUESSER-H: "Failed to fetch dynamically imported
// module: .../assets/CreateGroup-<hash>.js"). Cada deploy cambia los hashes de
// los assets (chunks JS/CSS): un cliente con el `index.html` viejo en una
// pestaña ya abierta pide un chunk que ya no existe → 404. Desplegamos con
// frecuencia, así que esto afecta a usuarios reales con la pestaña abierta.
//
// Dos vías de entrada, misma causa:
// 1. `vite:preloadError` — Vite lo dispara cuando falla la precarga de un
//    chunk lazy (el caso normal, cubierto desde #761).
// 2. Red de seguridad — `unhandledrejection`/`error` globales cuyo mensaje
//    delata el mismo fallo pero NO pasó por el mecanismo de preload de Vite
//    (p.ej. un `import()` dinámico cuyo rechazo escapa directo). Sin esto,
//    ese caso llega a Sentry como excepción sin que nadie recargue al usuario.
//
// Módulo puro + registro de listeners en un mismo fichero para poder testear
// la lógica (guard anti-bucle, detección del mensaje) sin depender de
// `window` real — `registerChunkReloadListeners` es la única parte con efectos.

const STORAGE_KEY = 'lg:chunk-reloaded'

// Ventana anti-bucle: si YA recargamos por este motivo hace menos de esto, no
// volvemos a recargar — el error persistiendo tras una recarga reciente no es
// un desfase de deploy sino un fallo real (red caída, CDN roto, bloqueador de
// contenido), y merece llegar a Sentry en vez de meter al usuario en un bucle
// de recargas.
const RELOAD_WINDOW_MS = 10_000

// Fragmentos de mensaje que delatan un chunk/import dinámico que ya no existe.
// Chrome/Vite: "Failed to fetch dynamically imported module"; Firefox/Safari:
// variantes de "error loading dynamically imported module". Case-insensitive:
// no vale la pena acoplarse a la capitalización exacta de cada navegador.
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
]

/** `true` si el mensaje de error corresponde a un chunk/import dinámico caído. */
export function isChunkLoadError(message: string | null | undefined): boolean {
  if (!message) return false
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Guard puro: `true` la primera vez (o si la última recarga por este motivo
 * fue hace más de `RELOAD_WINDOW_MS`) — y en ese caso deja la marca puesta
 * con el timestamp actual. `false` si ya recargamos hace poco (no toca la
 * marca: el bloqueo cuenta desde la recarga real, no se alarga con reintentos).
 */
export function shouldReloadForChunkError(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now: number = Date.now(),
): boolean {
  const last = storage.getItem(STORAGE_KEY)
  if (last !== null && now - Number(last) < RELOAD_WINDOW_MS) return false
  storage.setItem(STORAGE_KEY, String(now))
  return true
}

type RegisterOptions = {
  target?: Pick<Window, 'addEventListener'>
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  reload?: () => void
}

/**
 * Engancha los tres listeners de arriba. Se llama una vez, pronto en el
 * arranque (`main.tsx`). Parámetros inyectables solo para test — en
 * producción se usan `window`/`sessionStorage`/`location.reload` reales.
 */
export function registerChunkReloadListeners(options: RegisterOptions = {}): void {
  const {
    target = window,
    storage = sessionStorage,
    reload = () => window.location.reload(),
  } = options

  function reloadOnce(): boolean {
    if (!shouldReloadForChunkError(storage)) return false
    reload()
    return true
  }

  // Vía 1: Vite avisa explícitamente de un chunk lazy que no se pudo precargar.
  target.addEventListener('vite:preloadError', (event) => {
    // Si NO recargamos (recarga reciente ya consumida), dejamos el evento
    // fluir tal cual: es un fallo real, visible en Sentry como antes.
    if (reloadOnce()) event.preventDefault()
  })

  // Vía 2 (red de seguridad): el mismo fallo, pero como rechazo sin manejar
  // (p.ej. un `import()` dinámico fuera del mecanismo de preload de Vite).
  target.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown
    const message = reason instanceof Error ? reason.message : String(reason)
    if (!isChunkLoadError(message)) return
    if (reloadOnce()) event.preventDefault()
  })

  // Vía 2b: mismo fallo, pero como `error` global (algunos navegadores lo
  // reportan así en vez de como rechazo).
  target.addEventListener('error', (event) => {
    if (!isChunkLoadError(event.message)) return
    if (reloadOnce()) event.preventDefault()
  })
}
