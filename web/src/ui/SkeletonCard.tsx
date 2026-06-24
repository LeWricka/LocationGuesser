import { Card } from './Card'
import { Skeleton } from './Skeleton'
import styles from './SkeletonCard.module.css'

interface Props {
  /** Líneas de texto del cuerpo (la primera más ancha, las demás más cortas). */
  lines?: number
  /** Muestra un avatar/círculo a la izquierda (listas de personas o grupos). */
  avatar?: boolean
  /** Muestra un bloque de acción a la derecha (un botón "fantasma"). */
  action?: boolean
  className?: string
}

// Placeholder de una tarjeta de lista (grupo, turno, miembro…) mientras carga.
// Reúne el patrón Card + filas de Skeleton que antes se repetía a mano en cada
// pantalla, para que un skeleton "se parezca" al contenido real de un vistazo y
// la espera se perciba más corta. Decorativo: el shimmer y el aria-hidden los
// pone <Skeleton/>; el contenedor de carga (role=status) lo pone quien lo usa.
export function SkeletonCard({ lines = 2, avatar = false, action = false, className }: Props) {
  return (
    <Card padding="md" className={[styles.card, className].filter(Boolean).join(' ')}>
      {avatar && <Skeleton width={40} height={40} radius="full" />}
      <div className={styles.body}>
        {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
          <Skeleton key={i} width={i === 0 ? '60%' : '40%'} height={i === 0 ? 16 : 13} />
        ))}
      </div>
      {action && <Skeleton width={72} height={32} radius="sm" />}
    </Card>
  )
}
