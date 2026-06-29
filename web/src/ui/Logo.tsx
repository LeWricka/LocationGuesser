import styles from './Logo.module.css'

type Variant = 'mark' | 'wordmark'

interface Props {
  /** `mark` = solo símbolo; `wordmark` = símbolo + texto "Lugares". */
  variant?: Variant
  /**
   * Lado del símbolo en px (en `wordmark` también marca la escala del texto,
   * vía `font-size`, porque todo está en `em`). Por defecto 28.
   */
  size?: number
  /**
   * Monocromo: símbolo y texto heredan `currentColor` (para usar sobre el
   * acento o fondos de color). Por defecto el símbolo va en pizarra y el
   * wordmark en tinta.
   */
  monochrome?: boolean
  /** Texto accesible. Por defecto "Lugares". */
  title?: string
  className?: string
}

// Símbolo de marca: pin/gota de mapa con el centro hueco (un "lugar" señalado)
// y tres puntos en constelación = lugares compartidos. El cuerpo del pin usa
// `currentColor` para heredar el color del contenedor (token de acento); los
// satélites llevan el mismo acento a distintas opacidades. SVG inline, sin
// assets externos (coherente con /public/favicon.svg).
function Mark({ title }: { title: string }) {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 2.5c-5.06 0-9.16 4.04-9.16 9.02 0 3.2 1.9 6.18 4.05 8.52 2.16 2.35 4.6 4.07 5.11 4.42a1 1 0 0 0 1.14 0c.51-.35 2.95-2.07 5.11-4.42 2.15-2.34 4.05-5.32 4.05-8.52 0-4.98-4.1-9.02-9.16-9.02Zm0 5.42a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z"
      />
      <circle cx="26.7" cy="5.3" r="1.6" fill="currentColor" />
      <circle cx="5.4" cy="24.6" r="1.25" fill="currentColor" opacity="0.6" />
      <circle cx="25.6" cy="23.4" r="1" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

/**
 * Logo de "Lugares". Reutilizable y agnóstico de contexto: hereda el color del
 * padre (token de acento por defecto). No se cabea aún en pantallas — es la
 * pieza de marca que App/Home/Landing podrán componer.
 */
export function Logo({
  variant = 'wordmark',
  size = 28,
  monochrome = false,
  title = 'Lugares',
  className,
}: Props) {
  const classes = [styles.root, monochrome && styles.monochrome, className]
    .filter(Boolean)
    .join(' ')

  // `fontSize` en px fija la escala; el resto del layout es relativo (em).
  return (
    <span className={classes} style={{ fontSize: size }}>
      <Mark title={title} />
      {variant === 'wordmark' && <span className={styles.wordmark}>Lugares</span>}
    </span>
  )
}
