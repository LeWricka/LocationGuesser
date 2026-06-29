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
  // La foto manda: mientras el bitmap llega, mostramos un shimmer frío bajo el
  // hueco y revelamos la imagen con un breve fundido al cargar (en vez de un salto
  // o un flash en blanco). `loaded` salta a true en onLoad; si la imagen ya estaba
  // en caché, el navegador puede no disparar onLoad, así que comprobamos
  // `img.complete` en el ref para no dejar el shimmer colgado.
  const [loaded, setLoaded] = useState(false)
  const markLoaded = (el: HTMLImageElement | null) => {
    if (el?.complete) setLoaded(true)
  }

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
        <>
          {/* Capa de carga: shimmer frío que ocupa el marco hasta que la foto
              carga. Se desvanece bajo la imagen ya revelada (no salta a blanco). */}
          {!loaded && (
            <span className={`${styles.loading} lg-shimmer-surface`} aria-hidden="true" />
          )}
          <img
            ref={markLoaded}
            className={[styles.img, loaded ? 'lg-photo-in' : styles.imgHidden]
              .filter(Boolean)
              .join(' ')}
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
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
