import type { CSSProperties } from 'react'
import styles from './Logo.module.css'

type Variant = 'mark' | 'wordmark'

interface Props {
  /** `mark` = solo el símbolo (constelación); `wordmark` = símbolo + "Lugares". */
  variant?: Variant
  /**
   * Altura del logo en píxeles. El símbolo es cuadrado; en `wordmark` la
   * palabra escala proporcionalmente a esa altura.
   */
  size?: number
  /**
   * Color del símbolo. Por defecto `currentColor` (hereda del contexto, así un
   * mismo logo sirve en barra clara/oscura). `accent` lo fija al azul pizarra.
   */
  tone?: 'current' | 'accent'
  /** Texto accesible. El símbolo es decorativo cuando va junto a la palabra. */
  title?: string
  className?: string
}

// Nodos de la "ruta de lugares" (constelación) sobre un lienzo 24×24.
// El orden traza un recorrido orgánico de viaje; el último nodo (`anchor`) es
// el lugar donde estás ahora y va ligeramente reforzado.
const NODES = [
  { cx: 4, cy: 17 },
  { cx: 9.5, cy: 11.5 },
  { cx: 14, cy: 15.5 },
  { cx: 17, cy: 7.5 },
  { cx: 20, cy: 12.5 },
] as const
const ANCHOR = { cx: 17, cy: 7.5 } // el punto "vivo" de la ruta

// La línea sutil que une los lugares: una sola polilínea por los nodos.
const ROUTE = NODES.map((n) => `${n.cx},${n.cy}`).join(' ')

/**
 * Marca "Lugares": una constelación de puntos de mapa unidos por una ruta
 * sutil — los lugares que vives, unidos y compartidos. Evita el pin genérico;
 * lee como mapa + viaje, editorial. El wordmark añade "Lugares" en la serif de
 * marca (Cormorant) con el acento pizarra en la inicial.
 */
export function Logo({
  variant = 'mark',
  size = 32,
  tone = 'current',
  title = 'Lugares',
  className,
}: Props) {
  const style = { '--logo-size': `${size}px` } as CSSProperties
  const toneClass = tone === 'accent' ? styles.accent : styles.current
  const classes = [styles.logo, toneClass, className].filter(Boolean).join(' ')

  const isWordmark = variant === 'wordmark'

  return (
    <span className={classes} style={style} role="img" aria-label={isWordmark ? title : undefined}>
      <svg
        className={styles.mark}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={isWordmark ? true : undefined}
        role={isWordmark ? undefined : 'img'}
        aria-label={isWordmark ? undefined : title}
      >
        {/* Ruta sutil que une los lugares (la "constelación"). */}
        <polyline
          points={ROUTE}
          stroke="currentColor"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.45}
          fill="none"
        />
        {/* Lugares de la ruta. */}
        {NODES.map((n) => (
          <circle key={`${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={1.45} fill="currentColor" />
        ))}
        {/* Lugar "vivo" (donde estás ahora): halo + punto reforzado. */}
        <circle
          cx={ANCHOR.cx}
          cy={ANCHOR.cy}
          r={3.4}
          stroke="currentColor"
          strokeWidth={1}
          strokeOpacity={0.5}
          fill="none"
        />
        <circle cx={ANCHOR.cx} cy={ANCHOR.cy} r={2} fill="currentColor" />
      </svg>

      {isWordmark && <span className={styles.word}>Lugares</span>}
    </span>
  )
}
