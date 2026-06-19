import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  /** Llamado al pulsar Escape o el botón de cerrar. Si no se pasa, el modal no
   * es descartable (p. ej. el pop-up "Empezar" del temporizador). */
  onClose?: () => void
  title?: ReactNode
  /** Pie con acciones (botones). */
  footer?: ReactNode
  children: ReactNode
}

// Diálogo modal. A pantalla completa en móvil, centrado y acotado en desktop.
// role=dialog + aria-modal + foco gestionado + cierre con Escape.
export function Modal({ open, onClose, title, footer, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Cerrar con Escape y mover el foco al panel al abrir.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    if (!onClose) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const labelledBy = title ? 'lg-modal-title' : undefined

  return (
    <div className={styles.overlay} onClick={() => onClose?.()}>
      <div
        // stopPropagation: un clic dentro del panel no debe cerrar el modal.
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <header className={styles.header}>
            {title && (
              <h2 id="lg-modal-title" className={styles.title}>
                {title}
              </h2>
            )}
            {onClose && (
              <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
                ✕
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  )
}
