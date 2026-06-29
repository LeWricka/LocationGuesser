import styles from './Logo.module.css'

type Variant = 'mark' | 'wordmark'

interface Props {
  /**
   * `mark`: solo el símbolo (pin + gente). `wordmark`: símbolo + "Lugares".
   * Por defecto `wordmark` (la firma completa de marca).
   */
  variant?: Variant
  /**
   * Lado/alto en px. En `mark` es el lado del símbolo; en `wordmark` es la
   * altura de la firma (el ancho fluye con el texto). Por defecto 32.
   */
  size?: number
  /**
   * Color del símbolo. `ink` (tinta), `accent` (pizarra) o `current`
   * (hereda `currentColor` del contenedor). El wordmark va en tinta salvo
   * `accent`/`current`. Por defecto `ink`.
   */
  color?: 'ink' | 'accent' | 'current'
  /** Etiqueta accesible. Por defecto "Lugares". */
  title?: string
  className?: string
}

// Concepto "LUGAR + GENTE": el símbolo funde un PIN de mapa (el lugar) con dos
// siluetas que se tocan dentro de su hueco (la gente con la que compartes). La
// identidad no es el juego, es el compartir: por eso las dos cabezas que se
// asoman juntas, abrazadas por la gota. Sobrio y editorial; contorno de un solo
// trazo, sin degradados ni glows (sistema "Atelier").
//
// Presentacional puro: SVG inline (escala sin pixelar, hereda color vía
// `currentColor`), sin dependencias. Lo cablean App/Home/Landing; aquí solo se
// define el componente reutilizable.
export function Logo({
  variant = 'wordmark',
  size = 32,
  color = 'ink',
  title = 'Lugares',
  className,
}: Props) {
  const tone =
    color === 'accent' ? 'var(--accent)' : color === 'current' ? 'currentColor' : 'var(--ink-900)'

  // El símbolo se dibuja en un lienzo 32×40 (proporción de gota de pin).
  const mark = (
    <svg
      className={styles.mark}
      width={(size * 32) / 40}
      height={size}
      viewBox="0 0 32 40"
      fill="none"
      role={variant === 'mark' ? 'img' : undefined}
      aria-label={variant === 'mark' ? title : undefined}
      aria-hidden={variant === 'mark' ? undefined : true}
      style={{ color: tone }}
    >
      {/* Pin/gota: contorno cerrado que baja a punta. Trazo, no relleno: deja
          ver el "hueco" donde vive la gente, como una ventana al momento. */}
      <path
        d="M16 1.6c-7.2 0-13 5.5-13 12.4 0 8.6 11.3 22 12.4 23.3a.8.8 0 0 0 1.2 0C18.7 36 30 22.6 30 14 30 7.1 23.2 1.6 16 1.6Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* GENTE: dos siluetas (cabeza + hombros) que se tocan dentro del pin —
          el gesto de compartir con los tuyos. Relleno sólido = presencia. */}
      <g fill="currentColor">
        {/* Persona izquierda */}
        <circle cx="12.4" cy="11.2" r="2.7" />
        <path d="M7.4 21.4c0-2.8 2.2-5 5-5s5 2.2 5 5a.7.7 0 0 1-.7.7H8.1a.7.7 0 0 1-.7-.7Z" />
        {/* Persona derecha (se asoma sobre el hombro, abrazada) */}
        <circle cx="19.6" cy="11.2" r="2.7" />
        <path d="M14.6 21.4c0-2.8 2.2-5 5-5s5 2.2 5 5a.7.7 0 0 1-.7.7h-8.6a.7.7 0 0 1-.7-.7Z" />
      </g>
    </svg>
  )

  if (variant === 'mark') {
    return <span className={[styles.root, className].filter(Boolean).join(' ')}>{mark}</span>
  }

  return (
    <span
      className={[styles.root, styles.wordmark, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={title}
      style={{ fontSize: size, color: color === 'accent' ? 'var(--accent)' : undefined }}
    >
      {mark}
      <span className={styles.word} aria-hidden="true">
        Lugares
      </span>
    </span>
  )
}
