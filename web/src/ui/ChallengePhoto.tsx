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
  /** Si es interactiva, abre la foto a tamaño completo (lo cablea features). */
  onClick?: () => void
  className?: string
}

// Marco de la FOTO de un reto (vamos a reactivar la foto opcional por reto).
// Presentacional y mockeable por `src`. Mantiene proporción y recorta con
// object-fit para que la galería sea uniforme. Si no hay foto, placeholder.
export function ChallengePhoto({
  src,
  alt = 'Foto del reto',
  ratio = 'photo',
  size = 'md',
  caption,
  onClick,
  className,
}: Props) {
  const isButton = typeof onClick === 'function'
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

  if (isButton) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-label={alt}>
        {content}
      </button>
    )
  }
  return <div className={classes}>{content}</div>
}
