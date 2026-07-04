import { useEffect, useRef } from 'react'

/**
 * Cuánto puede vivir un dato ya resuelto antes de considerarlo potencialmente
 * caducado al volver a la pestaña (issue #638). Las URLs firmadas duran
 * `SIGNED_URL_TTL_SECONDS` (24h, ver lib/storage); recargamos al volver solo si
 * han pasado 20h — margen holgado por debajo del TTL. Antes eran 45min (herencia
 * del TTL de 1h pre-#639): con URLs de 24h ese umbral convertía cualquier vuelta
 * a la pestaña tras una pausa larga en una recarga innecesaria (reporte del
 * dueño, 4 jul). El `onerror` del preload sigue de red de seguridad para el
 * borde raro (URL caducada antes de tiempo).
 */
export const STALE_RELOAD_MS = 20 * 60 * 60 * 1000

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
