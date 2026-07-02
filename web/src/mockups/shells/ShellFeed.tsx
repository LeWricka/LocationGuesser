// ShellFeed — shell para listas/feeds: cabecera fija + feed con scroll.

import type { ReactNode } from 'react'
import styles from './ShellFeed.module.css'

interface Props {
  /** Cabecera fija: AppHeader + SegmentedControl opcional. */
  header?: ReactNode
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
