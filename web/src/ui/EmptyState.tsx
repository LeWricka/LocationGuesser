import type { ReactNode } from 'react'
import { Button } from './Button'
import styles from './EmptyState.module.css'

interface Props {
  /** Icono (emoji) decorativo sobre el título. Opcional. */
  icon?: ReactNode
  /** Título corto y claro: qué pasa o qué falta. */
  title: string
  /** Texto de apoyo: el porqué o el siguiente paso, en una frase. */
  description?: ReactNode
  /** Acción primaria (1 sola, para no diluir). Texto del botón. */
  actionLabel?: string
  onAction?: () => void
  /** Tono del estado: 'muted' (vacío neutro) o 'danger' (algo falló). */
  tone?: 'muted' | 'danger'
  className?: string
}

// Estado vacío/sin-datos reutilizable: icono opcional + título + apoyo + 1
// acción. Patrón de la guía de UX de empty states (Eleken): no dejar una
// pantalla en blanco, explicar qué pasa y dar UNA salida clara. Centrado y
// contenido en ancho de lectura para no abrumar. Distinto del hero del producto
// (HomeEmptyState): este es genérico para listas/secciones/errores.
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'muted',
  className,
}: Props) {
  const classes = [styles.empty, styles[`tone-${tone}`], className].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant={tone === 'danger' ? 'secondary' : 'primary'}
          onClick={onAction}
          className={styles.action}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
