// ShellFeed — shell para listas y feeds con scroll.
//
// CUÁNDO USARLO: diario de momentos, marcador de reto, historial —
// cualquier pantalla donde la cabecera es fija y el contenido scrollea.
//
// REGLAS DURAS:
//  - SIN backdrop (como el utilitario).
//  - Cabecera fija: siempre visible al scrollear.
//  - Feed con scroll propio contenido (evita scroll-escape en iOS).

import type { ReactNode } from 'react'
import styles from './ShellFeed.module.css'

interface Props {
  /** Cabecera fija: AppHeader + SegmentedControl/tabs opcionales. */
  header?: ReactNode
  /** Lista o feed de contenido con scroll propio. */
  children: ReactNode
}

export function ShellFeed({ header, children }: Props) {
  return (
    <div className={styles.root}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.feed}>{children}</div>
    </div>
  )
}
