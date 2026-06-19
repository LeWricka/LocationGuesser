import type { CSSProperties } from 'react'
import styles from './Spinner.module.css'

interface Props {
  /** Diámetro en píxeles. */
  size?: number
  /** Color del trazo activo (CSS color). Por defecto hereda currentColor. */
  color?: string
  label?: string
  className?: string
}

// Indicador de carga circular. role=status para que el lector de pantalla
// anuncie el estado de espera.
export function Spinner({ size = 18, color, label = 'Cargando', className }: Props) {
  const style = {
    '--spinner-size': `${size}px`,
    ...(color ? { '--spinner-color': color } : {}),
  } as CSSProperties
  return (
    <span
      className={[styles.spinner, className].filter(Boolean).join(' ')}
      style={style}
      role="status"
      aria-label={label}
    />
  )
}
