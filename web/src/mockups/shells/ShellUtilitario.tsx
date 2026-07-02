// ShellUtilitario — shell para pantallas de formulario sin protagonista visual.
//
// Reglas duras:
//  - SIN backdrop, SIN vacío negro, SIN caption flotante.
//  - Fondo siempre --paper (hoja limpia a pantalla completa).
//  - Cabecera con atrás + chip de título + contenido scrollable + CTA fijo.

import type { ReactNode } from 'react'
import styles from './ShellUtilitario.module.css'

interface Props {
  /** Cabecera completa (AppHeader variant="plain"). */
  header?: ReactNode
  /** Contenido principal con scroll. */
  children: ReactNode
  /** CTA anclado al fondo (un <Button fullWidth>). */
  footer?: ReactNode
}

export function ShellUtilitario({ header, children, footer }: Props) {
  return (
    <div className={styles.root}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
