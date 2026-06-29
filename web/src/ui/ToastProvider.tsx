import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Icon } from './Icon'
import { ToastContext } from './toast-context'
import type { ToastOptions, ToastTone } from './toast-context'
import styles from './Toast.module.css'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface Props {
  children: ReactNode
}

// Provee la API de toasts y pinta la pila. Envuelve la app una vez.
export function ToastProvider({ children }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Guardamos los timers para limpiarlos al descartar manualmente.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = crypto.randomUUID()
      const tone = options?.tone ?? 'neutral'
      const duration = options?.duration ?? 3500
      setToasts((prev) => [...prev, { id, message, tone }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {/* aria-live: el lector anuncia los nuevos avisos sin robar el foco. */}
      <div className={styles.region} role="region" aria-live="polite" aria-label="Avisos">
        {toasts.map((t) => (
          <div key={t.id} className={[styles.toast, styles[t.tone]].join(' ')} role="status">
            <span className={styles.message}>{t.message}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
            >
              <Icon icon={X} size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
