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

// ── GUARDA DE SUELO del historial (issue #983) ───────────────────────────────
// La PRIMERA entrada del historial de la sesión —donde se cargó el documento—
// es el "suelo" de la SPA: por debajo de ella ya no hay app (está el referrer,
// una pestaña en blanco, o un re-servido del shell). Un `history.back()` emitido
// desde el suelo NO es una navegación dentro de la SPA: hace que el navegador
// abandone el documento y lo RECARGUE (frame blanco → shell → re-hidratación),
// que es justo el fallo forense de #983 ("un atrás de más provoca recarga").
//
// Para poder distinguir el suelo del resto de entradas lo MARCAMOS en su
// `history.state` (`lgFloor`). Ninguna entrada que empujemos nosotros (la
// centinela de capas) puede heredar esta marca: si lo hiciera, la guarda no
// podría diferenciar "estoy en el suelo" de "estoy en una centinela sobre el
// suelo". Por eso el empuje de centinela la ELIMINA explícitamente (ver
// `useOverlayBack`). La marca solo cambia el `state` (mismo hash, sin evento).
const FLOOR_MARK = 'lgFloor'

/**
 * Marca la entrada ACTUAL del historial como el suelo de la app. Se llama una
 * vez, al montar el coordinador cerca de la raíz (aún no ha ocurrido ninguna
 * navegación propia), así que la entrada actual es la primera de la sesión.
 * Idempotente: si ya está marcada no reescribe.
 */
export function markHistoryFloor(): void {
  const state = window.history.state as Record<string, unknown> | null
  if (state?.[FLOOR_MARK]) return
  window.history.replaceState({ ...(state ?? {}), [FLOOR_MARK]: true }, '')
}

/** ¿Estamos AHORA mismo sobre la entrada-suelo (la primera de la sesión)? */
export function isAtHistoryFloor(): boolean {
  return (window.history.state as Record<string, unknown> | null)?.[FLOOR_MARK] === true
}

/**
 * Empuja la entrada-centinela de "hay capas abiertas" SIN heredar la marca de
 * suelo (si la entrada actual era el suelo, spread-earla propagaría `lgFloor` a
 * la centinela y rompería la guarda). Conserva el resto del `state` y no cambia
 * el hash (mismo hash → sin `hashchange`, el router por hash no se entera).
 */
export function pushOverlaySentinel(): void {
  const rest = { ...((window.history.state ?? {}) as Record<string, unknown>) }
  delete rest[FLOOR_MARK]
  window.history.pushState({ ...rest, lgOverlayBack: true }, '')
}

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
