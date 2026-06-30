import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
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

// Mide el alto del teclado del sistema vía VisualViewport. Implementado dentro
// del componente (defensivo): el hook compartido `lib/useVisualViewport` puede no
// existir aún en este worktree, y la API puede faltar (degradamos a 0 = sin
// reajuste). Es la raíz del bug de "la hoja queda tapada por el teclado": cuando
// el teclado sube, el viewport visual se encoge y subimos la hoja esa distancia.
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined
    // Inactiva o sin API: no nos suscribimos. No reseteamos a 0 aquí (eso
    // dispararía un render en cascada); el inset arranca en 0 y la hoja se
    // desmonta al cerrarse, así que no hay estado "sucio" que limpiar.
    if (!active || !vv) return
    function update() {
      if (!vv) return
      // Hueco entre el layout viewport y el visual = alto del teclado (aprox.).
      const gap = window.innerHeight - vv.height - vv.offsetTop
      setInset(gap > 0 ? gap : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return inset
}

// Hoja inferior formal y reutilizable: asa (grab), scrim, cierre y reajuste al
// teclado. La diferencia con <Modal> es el gesto de arrastre del asa y el inset
// de teclado; comparten el piso de capas (--z-overlay) y el portal a <body>.
export function BottomSheet({ open, onClose, title, footer, ariaLabel, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const keyboardInset = useKeyboardInset(open)
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
  // El inset del teclado sube la hoja; el arrastre la baja. Ambos vía transform.
  const panelStyle = {
    transform: `translateY(${dragY}px)`,
    marginBottom: keyboardInset ? `${keyboardInset}px` : undefined,
  } as CSSProperties

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
