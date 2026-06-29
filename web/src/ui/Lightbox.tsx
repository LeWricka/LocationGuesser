import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './Lightbox.module.css'

/** Una imagen del visor: URL + texto alternativo. */
export interface LightboxImage {
  src: string
  alt?: string
}

interface Props {
  open: boolean
  /** URL de la imagen (modo de una sola foto). Ignorado si se pasa `images`. */
  src?: string
  /** Texto alternativo del modo de una sola foto. */
  alt?: string
  /** Galería: si hay >1 se muestran flechas y se permite swipe. Tiene prioridad
   * sobre `src`/`alt`. Con 1 imagen se comporta como el modo de una sola foto. */
  images?: LightboxImage[]
  /** Índice inicial dentro de `images`. Por defecto 0. */
  startIndex?: number
  onClose: () => void
}

// Visor de imagen a pantalla completa (lightbox). Overlay propio en vez de
// reutilizar Modal: una foto quiere ocupar todo el viewport con fondo opaco y
// `object-fit: contain`, no la tarjeta acotada del Modal.
// Accesible: role=dialog + aria-modal, foco al panel, cierre con Esc y al tocar
// fuera (fondo), scroll del body bloqueado mientras está abierto. Con varias
// imágenes: flechas prev/next, teclas ←/→ y swipe horizontal en móvil.
export function Lightbox({
  open,
  src,
  alt = 'Foto del reto',
  images,
  startIndex = 0,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Zoom como toggle simple: tocar la imagen alterna tamaño completo / acercada.
  // Prioriza "verla grande y nítida" sin depender de gestos nativos de pinch.
  const [zoomed, setZoomed] = useState(false)

  // Normalizamos a un array de diapositivas: si llega `images`, manda; si no, el
  // modo de una sola foto (`src`). Así el resto del componente solo razona sobre
  // un array, sea cual sea la API de entrada.
  const slides: LightboxImage[] = images && images.length > 0 ? images : src ? [{ src, alt }] : []
  const multiple = slides.length > 1

  // Índice actual de la galería. Al ABRIR se posiciona en `startIndex`. Ajuste de
  // estado en render (no en efecto) siguiendo el patrón oficial de React para
  // reaccionar a un cambio de prop: guardamos el `open` previo en estado y, al
  // detectar la transición cerrado→abierto, reposicionamos. El componente no se
  // desmonta (open=false solo deja de renderizar), por eso hay que resetear.
  const [index, setIndex] = useState(0)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setIndex(Math.min(Math.max(0, startIndex), Math.max(0, slides.length - 1)))
  }

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

  // Navegación cíclica entre imágenes. Cambiar de foto resetea el zoom para que
  // la siguiente empiece ajustada al viewport.
  const go = useCallback(
    (delta: number) => {
      if (slides.length <= 1) return
      setZoomed(false)
      setIndex((i) => (i + delta + slides.length) % slides.length)
    },
    [slides.length],
  )

  // Bloquear el scroll del body mientras el visor está abierto.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Teclado: Escape cierra; ←/→ navegan (solo con varias imágenes).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, go])

  // Swipe horizontal en móvil: un arrastre claro pasa de foto. Umbral generoso
  // para no confundir con un toque o con el pan de la imagen acercada.
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [])
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = touchStartX.current
      touchStartX.current = null
      // El swipe solo navega si NO estamos acercados (ahí el arrastre hace pan).
      if (startX == null || zoomed || !multiple) return
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
      if (Math.abs(dx) < 50) return
      go(dx < 0 ? 1 : -1)
    },
    [zoomed, multiple, go],
  )

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

  if (!open || slides.length === 0) return null

  const current = slides[Math.min(index, slides.length - 1)]
  const currentAlt = current.alt ?? alt

  // Portal a document.body: el overlay es position:fixed, pero dentro de un
  // ancestro con transform/backdrop-filter/animación (el rediseño usa muchos) el
  // fixed se ancla a ESE ancestro, no al viewport → la foto salía "a lo ancho"
  // incrustada en la página en vez de a pantalla completa. Sacándolo al body se
  // ancla al viewport y cubre toda la pantalla como popup.
  return createPortal(
    // Tocar fuera (el fondo) cierra: el clic llega al overlay; el panel lo para.
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={currentAlt}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={onPanelKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        // stopPropagation: un clic dentro del panel no debe cerrar el visor.
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} onClick={close} aria-label="Cerrar">
          <Icon icon={X} />
        </button>
        {/* Flechas prev/next: solo con varias imágenes (con una, sin flechas). */}
        {multiple && (
          <>
            <button
              type="button"
              className={`${styles.nav} ${styles.prev}`}
              onClick={() => go(-1)}
              aria-label="Foto anterior"
            >
              <Icon icon={ChevronLeft} size={28} />
            </button>
            <button
              type="button"
              className={`${styles.nav} ${styles.next}`}
              onClick={() => go(1)}
              aria-label="Foto siguiente"
            >
              <Icon icon={ChevronRight} size={28} />
            </button>
          </>
        )}
        <button
          type="button"
          className={styles.imageButton}
          onClick={() => setZoomed((z) => !z)}
          aria-label={zoomed ? 'Alejar foto' : 'Acercar foto'}
          aria-pressed={zoomed}
        >
          <img
            className={`${styles.img} ${zoomed ? styles.zoomed : ''}`}
            src={current.src}
            alt={currentAlt}
          />
        </button>
        {/* Contador discreto (1/3) solo si hay varias. */}
        {multiple && (
          <span className={styles.counter} aria-hidden="true">
            {index + 1} / {slides.length}
          </span>
        )}
      </div>
    </div>,
    document.body,
  )
}
