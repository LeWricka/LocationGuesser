import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

type Padding = 'none' | 'sm' | 'md' | 'lg'

interface Props extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  padding?: Padding
  /** Eleva con sombra (úsalo para tarjetas destacadas, no para todo). */
  raised?: boolean
  children: ReactNode
}

// Contenedor de superficie. La unidad visual base del producto (un reto, un
// bloque de clasificación, el resultado de un enlace…).
export function Card({
  as: Tag = 'div',
  padding = 'md',
  raised = false,
  className,
  children,
  ...rest
}: Props) {
  const classes = [styles.card, styles[`pad-${padding}`], raised ? styles.raised : null, className]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
