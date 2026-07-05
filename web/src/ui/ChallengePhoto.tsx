import { useState } from 'react'
import { IconCamara } from './icons'
import { Lightbox } from './Lightbox'
import styles from './ChallengePhoto.module.css'

type Ratio = 'square' | 'photo' | 'wide'
type Size = 'sm' | 'md' | 'lg'

// Tamaño del icono de marca del placeholder, por tamaño de marco: discreto en una
// miniatura de tira (sm), algo más presente en el héroe de la hoja (lg). Issue #593:
// sustituye el icono "imagen rota" (ImageOff) por el placeholder de marca — mismo
// patrón "mapa nocturno" de `HomeDashboard` (gradiente de escena + icono translúcido).
const PLACEHOLDER_ICON_SIZE: Record<Size, number> = { sm: 18, md: 28, lg: 36 }

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
            // decoding="async" (issue #713, "el golpe post-carga"): sin él el navegador
            // puede decodificar la foto de forma SÍNCRONA en el hilo principal justo
            // al pintarla — con las miniaturas de la galería (SVG diminuto) no se nota,
            // pero una foto real subida por el usuario (cientos de KB a varios MB) sí
            // puede bloquear un frame entero. `BitacoraTab`/`LandingShowcase` ya lo
            // llevan; `ChallengePhoto` (la más reutilizada: tarjetas del diario,
            // podio, portadas…) se había quedado sin él.
            decoding="async"
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        // Sin foto: placeholder de MARCA (gradiente grafito/teal de escena + icono
        // de cámara translúcido), nunca un icono de "imagen rota" (issue #593).
        <span className={styles.placeholder} aria-label={alt} role="img">
          <IconCamara size={PLACEHOLDER_ICON_SIZE[size]} className={styles.placeholderIcon} />
        </span>
      )}
      {caption && (
        <span className={styles.caption}>
          {/* Texto en un hijo que hace el line-clamp SIN padding propio: el padding va
              en el contenedor (.caption), así el recorte a 2 líneas es exacto y no
              deja asomar media 3ª línea (quirk del line-clamp con padding). */}
          <span className={styles.captionText}>{caption}</span>
        </span>
      )}
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
