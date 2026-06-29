import type { ReactNode } from 'react'
import { Badge } from './Badge'
import { Card } from './Card'
import styles from './GroupCard.module.css'

/**
 * Estado de un grupo en la home (§3.1):
 * - 'live'   🔴 En vivo — hay reto(s) abierto(s).
 * - 'toplay' 🟡 Te toca — reto abierto sin tu voto (resaltado).
 * - 'idle'   ⚪ Al día — sin retos abiertos pendientes.
 */
export type GroupStatus = 'live' | 'toplay' | 'idle'

interface Props {
  /** Nombre del grupo (p.ej. "Interrail '26"). */
  name: string
  status: GroupStatus
  /** Marca 👑 "Tuyo" si el usuario es el dueño del grupo. */
  owned?: boolean
  /** Etiqueta de apoyo opcional bajo el nombre (p.ej. "5 miembros · 3 retos"). */
  meta?: ReactNode
  /** Al pulsar la tarjeta se navega a la página del grupo (lo cablea #3/#5). */
  onClick?: () => void
  className?: string
}

const STATUS_LABEL: Record<GroupStatus, string> = {
  live: 'En vivo',
  toplay: 'Te toca',
  idle: 'Al día',
}

// Tarjeta de grupo de la lista "Tus grupos". Presentacional: el estado y la
// propiedad llegan por props; el cableado de datos/navegación lo hace #3/#5.
export function GroupCard({ name, status, owned = false, meta, onClick, className }: Props) {
  const isButton = typeof onClick === 'function'
  const classes = [styles.card, status === 'toplay' ? styles.highlight : null, className]
    .filter(Boolean)
    .join(' ')

  // Card tipa sus props como atributos genéricos de HTMLElement (sin `type`);
  // cuando renderiza un <button> le pasamos type="button" para que, dentro de
  // un form, no envíe. Spread acotado para no tocar el tipo de Card.
  const buttonProps = isButton ? { type: 'button', 'aria-label': `Abrir viaje ${name}` } : {}

  return (
    <Card
      as={isButton ? 'button' : 'div'}
      padding="md"
      className={classes}
      onClick={onClick}
      {...buttonProps}
    >
      <div className={styles.body}>
        <div className={styles.heading}>
          <span className={styles.name}>{name}</span>
          {meta && <span className={styles.meta}>{meta}</span>}
        </div>
        <div className={styles.chips}>
          {status === 'live' ? (
            <Badge tone="live" dot>
              {STATUS_LABEL.live}
            </Badge>
          ) : status === 'toplay' ? (
            <Badge tone="warning" dot>
              {STATUS_LABEL.toplay}
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              {STATUS_LABEL.idle}
            </Badge>
          )}
          {owned && (
            <Badge tone="accent">
              <span aria-hidden="true">👑</span> Tuyo
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}
