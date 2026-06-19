import { createContext, useContext } from 'react'

export type ToastTone = 'neutral' | 'success' | 'danger'

export interface ToastOptions {
  tone?: ToastTone
  /** Milisegundos antes de auto-cerrar. 0 = persistente. */
  duration?: number
}

export interface ToastApi {
  /** Muestra un aviso efímero. Devuelve su id por si quieres cerrarlo a mano. */
  show: (message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
}

// Contexto separado del provider para no mezclar exports de componente y no
// componente en el mismo fichero (regla react-refresh/only-export-components).
export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
