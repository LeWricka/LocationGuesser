import { createContext, useContext, useEffect, useRef } from 'react'

// Coordinador GLOBAL de "atrás cierra la capa de encima" (issue #972). El hook
// de bajo nivel `useOverlayBack` gestiona UNA entrada de historial para "hay
// capas abiertas"; pero una capa (un Lightbox) puede abrirse SOBRE otra (una
// hoja) desde un componente distinto y anidado — y dos `useOverlayBack`
// independientes se pelearían por el mismo `popstate` del `window`. La solución
// es que TODAS las capas de la app se registren en UNA pila central: el
// proveedor (`OverlayBackProvider`) corre el ÚNICO `useOverlayBack`, con `depth`
// = tamaño de la pila y un `closeTop` que cierra la capa registrada más
// recientemente (la de encima).
//
// Así cada capa solo declara "estoy abierta y así me cierro" con
// `useOverlayLayer` —sin saber nada del historial ni de otras capas— y el
// anidamiento a cualquier profundidad funciona: el atrás cierra de arriba a
// abajo, capa a capa.
//
// El contexto y el hook viven en este `.ts` (sin JSX) y el proveedor en
// `OverlayBackProvider.tsx`, siguiendo el patrón del repo (toast-context.ts /
// ToastProvider.tsx) para no mezclar componente y no-componentes en el mismo
// módulo (react-refresh).

export interface OverlayBackApi {
  /** Registra una capa abierta; devuelve su id para des-registrarla luego. */
  register: (close: () => void) => number
  /** Quita una capa de la pila por su id. */
  unregister: (id: number) => void
}

export const OverlayBackContext = createContext<OverlayBackApi | null>(null)

/**
 * Declara una capa (hoja/modal/lightbox/menú) al coordinador: mientras `open`
 * sea `true`, el gesto atrás del navegador la cierra (llamando a `onClose`) en
 * vez de salir de la pantalla. Sin `OverlayBackProvider` encima es inocuo (no
 * hace nada), así que es seguro usarlo en componentes que a veces se montan
 * fuera del árbol de la app (galería visual, tests).
 *
 * @param open  `true` mientras la capa esté visible.
 * @param onClose  Cómo cerrar ESTA capa (lo mismo que hacen su ✕/scrim/Escape).
 */
export function useOverlayLayer(open: boolean, onClose: () => void): void {
  const ctx = useContext(OverlayBackContext)

  // `onClose` se lee por ref: así el registro no depende de que el padre recree
  // la función en cada render (re-registrar en cada render reordenaría la pila).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!ctx || !open) return
    const id = ctx.register(() => closeRef.current())
    return () => ctx.unregister(id)
  }, [ctx, open])
}
