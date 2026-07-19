import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

interface Props {
  /** Alto del bloque (CSS, p.ej. '1rem', 40, '50svh'). */
  height?: number | string
  /** Ancho del bloque (CSS). Por defecto 100%. */
  width?: number | string
  /** Radio: 'sm' inputs/botones, 'md' tarjetas, 'full' avatares/pills. */
  radius?: 'sm' | 'md' | 'lg' | 'full'
  /**
   * Superficie sobre la que se lee el placeholder (issue "entrada al viaje sin
   * flashazo"): 'surface' (por defecto) es el tono de siempre — papel/tarjeta
   * clara. 'scene' es para chrome flotando sobre una ESCENA OSCURA (mapa/globo a
   * sangre, mismo lenguaje que AppHeader/SegmentedControl/MapSkeleton) — usa los
   * tokens `--scene-*`, nunca el blanco/gris de 'surface', que "brillaba" como un
   * parche roto sobre el fondo oscuro real.
   */
  tone?: 'surface' | 'scene'
  className?: string
}

// Placeholder de carga con shimmer. Mejor que un spinner para contenido: el
// cerebro empieza a procesar el layout antes de que lleguen los datos (NN/g),
// por lo que la espera se percibe más corta. aria-hidden: el lector de pantalla
// lo ignora; el estado de carga se anuncia con role=status en el contenedor.
// El shimmer se detiene bajo prefers-reduced-motion (queda un bloque estático).
export function Skeleton({
  height = '1rem',
  width = '100%',
  radius = 'sm',
  tone = 'surface',
  className,
}: Props) {
  const style = {
    height: typeof height === 'number' ? `${height}px` : height,
    width: typeof width === 'number' ? `${width}px` : width,
  } as CSSProperties
  const classes = [styles.skeleton, styles[`tone-${tone}`], styles[`radius-${radius}`], className]
    .filter(Boolean)
    .join(' ')
  return <span className={classes} style={style} aria-hidden="true" />
}
