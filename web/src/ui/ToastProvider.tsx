import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { Icon } from './Icon'
import { ToastContext } from './toast-context'
import type { ToastOptions, ToastTone } from './toast-context'
import styles from './Toast.module.css'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
  // Ancla del aviso (issue #891): 'bottom' es el de siempre; 'top' lo saca
  // arriba para no chocar con la burbuja de un coach-mark del tutorial.
  position: 'top' | 'bottom'
  action?: { label: string; onClick: () => void }
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
      const position = options?.position ?? 'bottom'
      setToasts((prev) => [...prev, { id, message, tone, position, action: options?.action }])
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

  const renderToast = (t: ToastItem) => (
    <div key={t.id} className={[styles.toast, styles[t.tone]].join(' ')} role="status">
      {/* Check de confirmación (issue #891): solo en los avisos de éxito ARRIBA
          — la entrada deslizante + el check hacen la confirmación más viva que
          el toast plano de abajo. Decorativo: el mensaje ya lo dice todo. */}
      {t.position === 'top' && t.tone === 'success' && (
        <span className={styles.leadIcon} aria-hidden="true">
          <Icon icon={Check} size={16} />
        </span>
      )}
      <span className={styles.message}>{t.message}</span>
      {t.action && (
        <button
          type="button"
          className={[styles.action, 'lg-press'].join(' ')}
          onClick={() => {
            t.action?.onClick()
            dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        className={[styles.close, 'lg-press'].join(' ')}
        onClick={() => dismiss(t.id)}
        aria-label="Cerrar aviso"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )

  const topToasts = toasts.filter((t) => t.position === 'top')
  const bottomToasts = toasts.filter((t) => t.position === 'bottom')

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {/* aria-live: el lector anuncia los nuevos avisos sin robar el foco. Dos
          regiones (arriba/abajo) para poder anclar cada aviso donde toca sin que
          se pisen; la de arriba solo se pinta si hay algún aviso 'top'. */}
      {topToasts.length > 0 && (
        <div
          className={[styles.region, styles.regionTop].join(' ')}
          role="region"
          aria-live="polite"
          aria-label="Avisos"
        >
          {topToasts.map(renderToast)}
        </div>
      )}
      <div className={styles.region} role="region" aria-live="polite" aria-label="Avisos">
        {bottomToasts.map(renderToast)}
      </div>
    </ToastContext.Provider>
  )
}
