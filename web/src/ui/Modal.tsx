import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'
import { Icon } from './Icon'
import { useVisualViewport } from '../lib/useVisualViewport'
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
  // Conciencia del teclado: cuando el teclado del sistema recorta el viewport
  // visible, acotamos el alto del panel al alto visible y lo empujamos por
  // encima del teclado, para que el pie de acciones (footer) quede visible sin
  // scroll en vez de tapado. Sin teclado, `keyboardOpen` es false y no tocamos
  // nada (deja mandar al CSS: dvh en móvil, centrado en desktop).
  const { keyboardOpen, height: visibleHeight, offsetBottom } = useVisualViewport()

  // Cerrar con Escape y mover el foco al panel al abrir.
  // Enfocar el panel SOLO al abrir. Depender de `onClose` (que se recrea en
  // cada render) hacía que el efecto corriera en cada tecla y robara el foco al
  // input que estuvieras escribiendo.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open || !onClose) return
    // Capturamos en const para que TS conserve el narrowing dentro del closure.
    const close = onClose
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const labelledBy = title ? 'lg-modal-title' : undefined

  // Con el teclado abierto, el panel se ancla al fondo del área visible: su alto
  // máximo pasa a ser el alto que el usuario ve de verdad y lo levantamos
  // `offsetBottom` px (lo que el teclado se come por abajo). Así el borde
  // inferior del panel —donde vive el footer— cae justo sobre el teclado. El
  // body ya scrollea (flex:1 + overflow-y:auto), el footer queda alcanzable.
  const panelStyle: CSSProperties | undefined =
    keyboardOpen && visibleHeight != null
      ? { maxHeight: `${visibleHeight}px`, marginBottom: `${offsetBottom}px` }
      : undefined

  // Portal a <body>: el overlay usa position:fixed, que un ancestro con
  // transform/filter (p.ej. animaciones de entrada como lg-stagger) convertiría
  // en "fixed relativo a ese ancestro" → el modal se renderizaría descolocado
  // (inline) en vez de a pantalla completa. Sacándolo a body siempre cubre el
  // viewport, montes el <Modal> donde lo montes.
  return createPortal(
    <div className={styles.overlay} onClick={() => onClose?.()}>
      <div
        // stopPropagation: un clic dentro del panel no debe cerrar el modal.
        className={styles.panel}
        style={panelStyle}
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
                <Icon icon={X} />
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
