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
  /**
   * Desactiva la coreografía de entrada (cabecera/stagger/footer).
   * Solo para tests o la galería cuando haga falta determinismo explícito
   * más allá de `prefers-reduced-motion`; en producción siempre `true` (default).
   */
  entrance?: boolean
}

export function ShellUtilitario({ header, children, footer, entrance = true }: Props) {
  // Coreografía de entrada (issue #525), versión sobria (sin muelle): la
  // cabecera hace fade y el cuerpo entra escalonado. Las clases están siempre
  // en el árbol (nunca se togglean tras montar) así que la animación CSS corre
  // una única vez por montaje del shell — un re-render posterior reconcilia el
  // mismo nodo DOM y no reinicia `animation-name`.
  const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

  return (
    <div className={styles.root}>
      {header && <div className={cx(styles.header, entrance && styles.headerIn)}>{header}</div>}
      <div className={cx(styles.body, entrance && styles.bodyStagger)}>{children}</div>
      {footer && <div className={cx(styles.footer, entrance && styles.footerIn)}>{footer}</div>}
    </div>
  )
}
