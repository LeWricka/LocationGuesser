import { useEffect } from 'react'
import type { RefObject } from 'react'

// Caché a nivel de módulo (issue #970, ola 2 — "volver sin skeletons"): guarda
// el ÚLTIMO `scrollTop` de un contenedor por CLAVE (viaje+sección). `TripPage`
// se remonta ENTERO al volver de un reto (App.tsx no la mantiene viva, a
// diferencia de la home — issue #847); sin esto, la vuelta siempre aterrizaba
// arriba del todo aunque el usuario hubiera bajado bastante en la Bitácora o el
// Marcador. Módulo (no sessionStorage): mismo criterio que `tripDataCache` de
// `useTripData.ts` — vive mientras dure la pestaña, se pierde en un F5 (un
// recargado ya vuelve a empezar de cero en todo lo demás, no solo el scroll).
const scrollPositions = new Map<string, number>()

/**
 * Restaura y guarda el `scrollTop` de un contenedor por `key` (p.ej.
 * `${groupId}:${section}`), a través de remontes del componente que lo aloja.
 * `key` en `null` desactiva el hook (nada que restaurar/guardar todavía, p.ej.
 * mientras el viaje sigue cargando y el contenedor no existe).
 *
 * Se re-ejecuta cada vez que cambia `key` (o el propio `ref` corrido, aunque un
 * `ref` de React es estable): al cambiar de sección/viaje, restaura la posición
 * de la sección nueva y sigue guardando la de la que se acaba de dejar hasta el
 * último instante (el `return` del efecto corre ANTES del siguiente restore).
 */
export function useScrollRestore(key: string | null, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!key) return
    const el = ref.current
    if (!el) return

    const saved = scrollPositions.get(key)
    if (saved != null) el.scrollTop = saved

    // Sin throttle deliberado: `scrollTop` es una lectura síncrona barata y el
    // evento de scroll ya viene limitado por el navegador a un frame — no hay
    // trabajo caro aquí que amortizar.
    const onScroll = () => {
      scrollPositions.set(key, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      // Última posición al desmontar/cambiar de clave (p.ej. cambiar de tab):
      // por si el usuario dejó de hacer scroll justo antes de navegar y el
      // último evento 'scroll' no llegó a disparar.
      scrollPositions.set(key, el.scrollTop)
      el.removeEventListener('scroll', onScroll)
    }
  }, [key, ref])
}

/** SOLO para tests: vacía la caché de módulo entre casos. Nunca en producción. */
export function __resetScrollRestoreForTests(): void {
  scrollPositions.clear()
}
