import type { ReactNode } from 'react'
import styles from './Badge.module.css'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live'

interface Props {
  tone?: Tone
  /** Punto previo (útil para "en vivo"). */
  dot?: boolean
  className?: string
  children: ReactNode
}

// Etiqueta compacta de estado: "🔴 en vivo", "cerrado", puntos, etc.
export function Badge({ tone = 'neutral', dot = false, className, children }: Props) {
  const classes = [styles.badge, styles[tone], className].filter(Boolean).join(' ')
  return (
    <span className={classes}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}
