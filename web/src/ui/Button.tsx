import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Muestra spinner y bloquea la interacción sin cambiar el ancho del botón. */
  loading?: boolean
  /** Ocupa todo el ancho disponible (típico en CTAs móviles). */
  fullWidth?: boolean
  /**
   * Botón-icono circular de 44px (atrás, cerrar, ⋯). El contenido es un único
   * `Icon`; exige `aria-label` propio porque no hay texto visible.
   */
  iconButton?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  iconButton = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = [
    styles.button,
    styles[variant],
    iconButton ? styles.iconButton : styles[size],
    fullWidth ? styles.fullWidth : null,
    loading ? styles.loading : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      // type explícito: por defecto los <button> dentro de un form envían;
      // aquí lo forzamos a "button" salvo que se indique lo contrario.
      type={type}
      className={classes}
      // Mientras carga, deshabilitamos pero seguimos comunicando "ocupado".
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={16} className={styles.spinner} />}
      <span className={styles.label}>{children}</span>
    </button>
  )
}
