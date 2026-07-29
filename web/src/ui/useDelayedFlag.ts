import { useEffect, useState } from 'react'

// Contrato nativo AC-3 (issue #984): antes, todo fallback de `<Suspense>` y todo
// `if (loading)` con esqueleto propio se pintaba INCONDICIONAL, aunque el
// chunk/dato resolviera en 50ms — parpadeo de esqueleto evitable en cada
// navegación/carga rápida. Constante ÚNICA: quien decida moverla, la mueve para
// TODOS los fallbacks a la vez (App.tsx + useTripData/useHomeData vía sus
// pantallas), no una por una.
export const SKELETON_DELAY_MS = 250

/**
 * `false` hasta que pasan `ms` desde el montaje; entonces pasa a `true` y se
 * queda así. Si quien lo usa se DESMONTA antes (el contenido real ya llegó y
 * reemplazó la rama que montaba este hook — el caso normal de una carga
 * rápida), el timeout se cancela en el cleanup y el flag nunca llega a `true`:
 * no hay parpadeo que evitar porque el esqueleto nunca se pintó.
 *
 * En un fichero propio (no en `DelayedFallback.tsx`): `react-refresh` exige que
 * un fichero de COMPONENTE solo exporte componentes, para que el fast-refresh
 * de Vite no pierda el estado del árbol al editar.
 */
export function useDelayedFlag(ms: number = SKELETON_DELAY_MS): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShow(true), ms)
    return () => window.clearTimeout(id)
  }, [ms])

  return show
}
