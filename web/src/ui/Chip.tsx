import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'
import styles from './Chip.module.css'

type Tone = 'neutral' | 'accent' | 'gold' | 'success' | 'danger'

interface Props {
  tone?: Tone
  /** Icono de línea opcional a la izquierda (lucide). */
  icon?: LucideIcon
  className?: string
  children: ReactNode
}

// Pastilla compacta de metadato/etiqueta: "12 recuerdos", "Reto", un estado.
// A diferencia de Badge (mayúsculas, voz de estado), el Chip es de caja baja y
// para conteos/etiquetas de contenido. Tonos vía tokens, sin color a mano.
export function Chip({ tone = 'neutral', icon, className, children }: Props) {
  const classes = [styles.chip, styles[tone], className].filter(Boolean).join(' ')
  return (
    <span className={classes}>
      {icon && <Icon icon={icon} size={14} className={styles.icon} />}
      {children}
    </span>
  )
}
