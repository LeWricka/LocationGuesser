import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { useVisualViewport } from '../lib/useVisualViewport'
import styles from './BottomSheet.module.css'

interface Props {
  open: boolean
  /** Cerrar al pulsar el scrim, Escape o arrastrar el asa hacia abajo. */
  onClose: () => void
  /** Título opcional en serif (cabecera de la hoja). */
  title?: ReactNode
  /** Pie con acciones (botones), anclado al fondo con safe-area. */
  footer?: ReactNode
  /** Etiqueta accesible si no hay título. */
  ariaLabel?: string
  children: ReactNode
}

// Hoja inferior formal y reutilizable: asa (grab), scrim, cierre y reajuste al
// teclado. La diferencia con <Modal> es el gesto de arrastre del asa; comparten
// el piso de capas (--z-overlay), el portal a <body> y la conciencia del teclado
// vía `useVisualViewport`.
export function BottomSheet({ open, onClose, title, footer, ariaLabel, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Conciencia del teclado (raíz del bug "la hoja queda tapada por el teclado"):
  // cuando el teclado del sistema recorta el viewport visible, empujamos la hoja
  // por encima (`offsetBottom`) y acotamos su alto al alto visible, para que el
  // pie de acciones quede visible sin scroll en lugar de tapado. El hook solo
  // corre mientras la hoja está montada (devolvemos null al cerrarse).
  const { keyboardOpen, height: visibleHeight, offsetBottom } = useVisualViewport()
  // Desplazamiento del arrastre del asa hacia abajo (px). Se resetea al soltar.
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)

  // Enfocar el panel al abrir (foco gestionado como en Modal).
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientY
    // Capturar el puntero mantiene el arrastre aunque el dedo salga del asa. Se
    // guarda con feature-check: jsdom (tests) no implementa setPointerCapture.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current === null) return
    // Solo permitimos arrastrar hacia abajo (cerrar); hacia arriba no estira.
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }
  function onPointerUp() {
    // Umbral de 96px: por debajo vuelve a su sitio, por encima cierra.
    if (dragY > 96) onClose()
    dragStart.current = null
    setDragY(0)
  }

  const labelledBy = title ? 'bottomsheet-title' : undefined
  // Con teclado: subimos la hoja `offsetBottom` px (lo que el teclado se come) y
  // acotamos su alto al alto visible; su borde inferior —donde vive el footer—
  // cae justo sobre el teclado y el body scrollea dentro. El arrastre del asa la
  // baja (transform). Sin teclado no fijamos alto: manda el CSS (--sheet-max-height).
  const keyboardAdjust = keyboardOpen && visibleHeight != null
  const panelStyle: CSSProperties = {
    transform: `translateY(${dragY}px)`,
    marginBottom: keyboardAdjust ? `${offsetBottom}px` : undefined,
    maxHeight: keyboardAdjust ? `${visibleHeight}px` : undefined,
  }

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.panel}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Asa: zona de arrastre. El botón la hace accesible (cierra al pulsar). */}
        <button
          type="button"
          className={styles.grabZone}
          aria-label="Cerrar hoja"
          onClick={onClose}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className={styles.grab} aria-hidden="true" />
        </button>
        {title && (
          <header className={styles.header}>
            <h2 id="bottomsheet-title" className={styles.title}>
              {title}
            </h2>
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
