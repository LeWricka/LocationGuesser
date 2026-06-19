import type { CSSProperties, ElementType, ReactNode } from 'react'
import styles from './Row.module.css'

type Gap = 1 | 2 | 3 | 4 | 5 | 6
type Align = 'start' | 'center' | 'end' | 'baseline' | 'stretch'
type Justify = 'start' | 'center' | 'end' | 'between'

interface Props {
  as?: ElementType
  gap?: Gap
  align?: Align
  justify?: Justify
  /** Permite que los hijos salten de línea en pantallas estrechas. */
  wrap?: boolean
  className?: string
  children: ReactNode
}

// Fila horizontal. Pareja de Stack para layouts simples sin escribir flexbox.
export function Row({
  as: Tag = 'div',
  gap = 3,
  align = 'center',
  justify = 'start',
  wrap = false,
  className,
  children,
}: Props) {
  const style = { '--row-gap': `var(--space-${gap})` } as CSSProperties
  const classes = [
    styles.row,
    styles[`align-${align}`],
    styles[`justify-${justify}`],
    wrap ? styles.wrap : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={classes} style={style}>
      {children}
    </Tag>
  )
}
