import { useState } from 'react'
import { Lightbox } from './Lightbox'
import styles from './ChallengePhoto.module.css'

type Ratio = 'square' | 'photo' | 'wide'
type Size = 'sm' | 'md' | 'lg'

interface Props {
  /** URL de la foto del reto. Si falta, se muestra un placeholder. */
  src?: string | null
  /** Texto alternativo (descriptivo del lugar/reto). */
  alt?: string
  /** Proporción del marco. 'photo' (4:3) por defecto. */
  ratio?: Ratio
  size?: Size
  /** Etiqueta superpuesta opcional (p.ej. la distancia o "reto de Ana"). */
  caption?: string
  /** Acción al pulsar. Si se pasa, tiene prioridad sobre el lightbox interno
   * (lo cablea features para, p. ej., navegar). */
  onClick?: () => void
  /** Permite abrir la foto a tamaño completo en un lightbox al pulsarla.
   * Por defecto sí, siempre que haya `src` y no se pase `onClick`. */
  zoomable?: boolean
  className?: string
}

// Marco de la FOTO de un reto. Presentacional y mockeable por `src`. Mantiene
// proporción y recorta con object-fit para que la galería sea uniforme. Si no
// hay foto, placeholder. Por defecto la foto es pulsable para verla grande en
// un lightbox (no requiere cableado desde las pantallas).
export function ChallengePhoto({
  src,
  alt = 'Foto del reto',
  ratio = 'photo',
  size = 'md',
  caption,
  onClick,
  zoomable = true,
  className,
}: Props) {
  const [open, setOpen] = useState(false)

  // Prioridad: onClick explícito > lightbox interno (si hay foto y es zoomable).
  const opensLightbox = !onClick && zoomable && Boolean(src)
  const handleClick = onClick ?? (opensLightbox ? () => setOpen(true) : undefined)
  const isButton = typeof handleClick === 'function'

  const classes = [styles.frame, styles[`ratio-${ratio}`], styles[size], className]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {src ? (
        <img className={styles.img} src={src} alt={alt} loading="lazy" />
      ) : (
        <span className={styles.placeholder} aria-label={alt} role="img">
          <span aria-hidden="true">🏔️</span>
        </span>
      )}
      {caption && <span className={styles.caption}>{caption}</span>}
    </>
  )

  // aria-label del botón: si abre el lightbox, lo decimos explícitamente para
  // que el usuario de lector de pantalla sepa que la acción amplía la foto.
  const buttonLabel = opensLightbox ? `Ampliar foto: ${alt}` : alt

  return (
    <>
      {isButton ? (
        <button type="button" className={classes} onClick={handleClick} aria-label={buttonLabel}>
          {content}
        </button>
      ) : (
        <div className={classes}>{content}</div>
      )}
      {opensLightbox && src && (
        <Lightbox open={open} src={src} alt={alt} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
