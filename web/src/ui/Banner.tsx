import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'
import styles from './Banner.module.css'

type Tone = 'info' | 'aviso' | 'oferta'

interface Props {
  tone?: Tone
  /** Icono de línea opcional a la izquierda (lucide). */
  icon?: LucideIcon
  /** Acción opcional a la derecha (un Button, normalmente). */
  action?: ReactNode
  className?: string
  children: ReactNode
}

// Aviso destacado de fila ancha: "Te toca jugar", offline, una oferta. Más fuerte
// que un Chip (ocupa el ancho, lleva acción) y menos que un Modal (no interrumpe).
// El tono "aviso" usa role=alert para que el lector lo anuncie de inmediato.
export function Banner({ tone = 'info', icon, action, className, children }: Props) {
  const classes = [styles.banner, styles[tone], className].filter(Boolean).join(' ')
  return (
    <div className={classes} role={tone === 'aviso' ? 'alert' : 'status'}>
      {icon && <Icon icon={icon} size={20} className={styles.icon} />}
      <div className={styles.content}>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
