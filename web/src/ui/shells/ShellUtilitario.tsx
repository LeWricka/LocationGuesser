// ShellUtilitario — shell para pantallas sin protagonista visual.
//
// CUÁNDO USARLO: formularios, configuración, perfil, auth — cualquier pantalla
// donde NO hay mapa, foto o Street View como protagonista.
//
// REGLAS DURAS (codificadas):
//  - SIN backdrop, SIN vacío negro: fondo siempre --paper (hoja limpia).
//  - SIN caption flotante: sin protagonista el caption no tiene contexto.
//  - CTA como footer en el flujo flex, NUNCA absoluto.
//
// Por qué: el reto de "cifra" y los formularios rompían con el ShellInmersivo
// porque no había protagonista → aparecía el vacío negro. Este shell evita que
// ese bug pueda repetirse: no tiene layer de backdrop.

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
