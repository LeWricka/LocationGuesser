import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Lightbox.module.css'

interface Props {
  open: boolean
  /** URL de la imagen a mostrar a tamaño completo. */
  src: string
  /** Texto alternativo (descriptivo del lugar/reto). */
  alt?: string
  onClose: () => void
}

// Visor de imagen a pantalla completa (lightbox). Overlay propio en vez de
// reutilizar Modal: una foto quiere ocupar todo el viewport con fondo opaco y
// `object-fit: contain`, no la tarjeta acotada del Modal.
// Accesible: role=dialog + aria-modal, foco al panel, cierre con Esc y fondo,
// scroll del body bloqueado mientras está abierto.
export function Lightbox({ open, src, alt = 'Foto del reto', onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Zoom como toggle simple: tocar la imagen alterna tamaño completo / acercada.
  // Prioriza "verla grande y nítida" sin depender de gestos nativos de pinch.
  const [zoomed, setZoomed] = useState(false)

  // Al abrir: enfocar el panel (para que Esc y el foco atrapado funcionen).
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Cerrar reseteando el zoom: cada apertura empieza ajustada al viewport sin
  // arrastrar el estado de la sesión anterior (el componente no se desmonta).
  const close = useCallback(() => {
    setZoomed(false)
    onClose()
  }, [onClose])

  // Bloquear el scroll del body mientras el visor está abierto.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Foco atrapado básico: si Tab saca el foco fuera del panel, lo devolvemos.
  const onPanelKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusables || focusables.length === 0) {
      e.preventDefault()
      panel?.focus()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!open) return null

  // Portal a document.body: el overlay es position:fixed, pero dentro de un
  // ancestro con transform/backdrop-filter/animación (el rediseño usa muchos) el
  // fixed se ancla a ESE ancestro, no al viewport → la foto salía "a lo ancho"
  // incrustada en la página en vez de a pantalla completa. Sacándolo al body se
  // ancla al viewport y cubre toda la pantalla como popup.
  return createPortal(
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={onPanelKeyDown}
        // stopPropagation: un clic dentro del panel no debe cerrar el visor.
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} onClick={close} aria-label="Cerrar">
          ✕
        </button>
        <button
          type="button"
          className={styles.imageButton}
          onClick={() => setZoomed((z) => !z)}
          aria-label={zoomed ? 'Alejar foto' : 'Acercar foto'}
          aria-pressed={zoomed}
        >
          <img className={`${styles.img} ${zoomed ? styles.zoomed : ''}`} src={src} alt={alt} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
