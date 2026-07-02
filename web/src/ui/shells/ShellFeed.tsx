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
  /**
   * Desactiva la coreografía de entrada (cabecera/stagger).
   * Solo para tests o la galería cuando haga falta determinismo explícito
   * más allá de `prefers-reduced-motion`; en producción siempre `true` (default).
   */
  entrance?: boolean
}

export function ShellFeed({ header, children, entrance = true }: Props) {
  // Coreografía de entrada (issue #525), como ShellUtilitario: cabecera con
  // fade, feed escalonado, sin muelle. Clases siempre en el árbol (nunca se
  // togglean tras montar) → la animación CSS corre una única vez por montaje
  // del shell; un re-render posterior reconcilia el mismo nodo DOM.
  const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

  return (
    <div className={styles.root}>
      {header && <div className={cx(styles.header, entrance && styles.headerIn)}>{header}</div>}
      <div className={cx(styles.feed, entrance && styles.feedStagger)}>{children}</div>
    </div>
  )
}
