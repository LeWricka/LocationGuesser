import { useEffect, useRef } from 'react'

/**
 * Cuánto puede vivir un dato ya resuelto antes de considerarlo potencialmente
 * caducado al volver a la pestaña (issue #638). Las URLs firmadas duran
 * `SIGNED_URL_TTL_SECONDS` (24h, ver lib/storage), pero una PWA puede quedar
 * viva en segundo plano mucho más — 45min es un margen prudente por debajo de
 * ese TTL: si ha pasado más, re-resolvemos por delante en vez de esperar a que
 * el usuario vea portadas en blanco (y confiar solo en el `onerror` del preload).
 */
export const STALE_RELOAD_MS = 45 * 60 * 1000

/**
 * Dispara `reload` cuando la pestaña vuelve a primer plano (`visibilitychange`)
 * y el último dato resuelto tiene más de `staleMs`. Compartido por los hooks de
 * datos de home y viaje (issue #638) para no repetir el mismo listener tres
 * veces con pequeñas variaciones.
 *
 * `getLastResolvedAt`/`reload` se leen en el momento del evento vía refs (no en
 * las deps del efecto): así el listener se engancha UNA vez por montaje y no se
 * reengancha en cada resolución — solo `staleMs` puede reabrir el efecto, y en
 * la práctica es una constante.
 */
export function useVisibilityReload(
  getLastResolvedAt: () => number | null,
  reload: () => void,
  staleMs: number = STALE_RELOAD_MS,
): void {
  const getLastResolvedAtRef = useRef(getLastResolvedAt)
  const reloadRef = useRef(reload)
  // Refrescar refs fuera del render (regla react-hooks/refs): un efecto sin deps
  // corre tras CADA commit, así el listener de abajo siempre lee la versión
  // vigente sin tener que reengancharse.
  useEffect(() => {
    getLastResolvedAtRef.current = getLastResolvedAt
    reloadRef.current = reload
  })

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const lastResolvedAt = getLastResolvedAtRef.current()
      // Sin resolución previa (aún cargando por primera vez): nada que refrescar.
      if (lastResolvedAt == null) return
      if (Date.now() - lastResolvedAt > staleMs) reloadRef.current()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [staleMs])
}
