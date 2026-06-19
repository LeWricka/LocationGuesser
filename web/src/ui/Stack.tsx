import type { CSSProperties, ElementType, ReactNode } from 'react'
import styles from './Stack.module.css'

type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
type Align = 'start' | 'center' | 'end' | 'stretch'

interface Props {
  /** Etiqueta a renderizar (div por defecto). Permite usar Stack como <main>, <section>… */
  as?: ElementType
  /** Separación entre hijos en pasos de la escala de espaciado. */
  gap?: Gap
  align?: Align
  className?: string
  children: ReactNode
}

// Apilado vertical. La separación se expresa con un token (--space-N) vía
// variable inline para no generar una clase por cada gap posible.
export function Stack({ as: Tag = 'div', gap = 4, align = 'stretch', className, children }: Props) {
  const style = { '--stack-gap': `var(--space-${gap})` } as CSSProperties
  const classes = [styles.stack, styles[`align-${align}`], className].filter(Boolean).join(' ')
  return (
    <Tag className={classes} style={style}>
      {children}
    </Tag>
  )
}
