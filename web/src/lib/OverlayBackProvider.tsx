import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { OverlayBackContext, markHistoryFloor, type OverlayBackApi } from './overlayBack'
import { useOverlayBack } from './useOverlayBack'

// Proveedor del coordinador global de "atrás cierra la capa de encima" (issue
// #972). Ver la doc del modelo en `overlayBack.ts`. Se monta UNA vez cerca de la
// raíz de la app, envolviendo todo lo que pueda abrir capas.

interface Entry {
  id: number
  close: () => void
}

// Id incremental por proceso: solo necesita ser único entre entradas vivas.
let nextEntryId = 0

export function OverlayBackProvider({ children }: { children: ReactNode }) {
  // La pila vive en una ref (mutación sin re-render); `depth` es el espejo en
  // estado que alimenta a `useOverlayBack` y dispara el push/pop del historial.
  const entriesRef = useRef<Entry[]>([])
  const [depth, setDepth] = useState(0)

  // Marca la entrada actual como SUELO del historial (issue #983). El proveedor
  // se monta una vez cerca de la raíz, ANTES de cualquier navegación propia de
  // la app, así que la entrada actual es la primera de la sesión: la que un
  // `history.back()` no puede cruzar sin recargar el documento. La guarda de
  // suelo de `useOverlayBack` lee esta marca para no emitir ese back fatal.
  useEffect(() => {
    markHistoryFloor()
  }, [])

  const register = useCallback((close: () => void) => {
    const id = ++nextEntryId
    entriesRef.current.push({ id, close })
    setDepth(entriesRef.current.length)
    return id
  }, [])

  const unregister = useCallback((id: number) => {
    entriesRef.current = entriesRef.current.filter((e) => e.id !== id)
    setDepth(entriesRef.current.length)
  }, [])

  // Cierra la capa de MÁS ARRIBA = la última registrada (la que se abrió encima
  // de las demás). Su `close` bajará su propio `open`, que la des-registra y
  // reduce `depth`; `useOverlayBack` se encarga de re-empujar la centinela si
  // aún quedan capas por debajo.
  const closeTop = useCallback(() => {
    const top = entriesRef.current[entriesRef.current.length - 1]
    top?.close()
  }, [])

  useOverlayBack(depth, closeTop)

  const api = useMemo<OverlayBackApi>(() => ({ register, unregister }), [register, unregister])

  return <OverlayBackContext.Provider value={api}>{children}</OverlayBackContext.Provider>
}
