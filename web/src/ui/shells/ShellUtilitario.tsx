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

import type { CSSProperties, ReactNode } from 'react'
import { useVisualViewport } from '../../lib/useVisualViewport'
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

  // Issue #904: las pantallas que usan este shell viven dentro de un contenedor
  // `position: fixed; inset: 0` (ver CreateGroup/CreateNumberChallenge/etc.) que
  // NO se contrae cuando aparece el teclado virtual — su `height: 100%` sigue
  // resolviendo contra el viewport de LAYOUT, no el visible, así que `.footer`
  // (fijo al final de la columna flex) queda oculto bajo el teclado y `.body`
  // no llega a necesitar scrollear porque el propio `.root` no se ha achicado.
  // Igual que en `Modal`/`BottomSheet`, capamos la altura al alto visible real
  // vía `useVisualViewport` para que `.body` (ya `overflow-y:auto`) SÍ tenga que
  // scrollear y el `.footer` caiga justo sobre el teclado, visible. A diferencia
  // de esos dos (paneles centrados/anclados abajo en un overlay), este shell ya
  // está anclado arriba dentro de su contenedor fijo: basta con `maxHeight`, sin
  // `marginBottom` — no hace falta "empujarlo" hacia arriba, solo achicarlo.
  const { keyboardOpen, height: visibleHeight } = useVisualViewport()
  const rootStyle: CSSProperties | undefined =
    keyboardOpen && visibleHeight != null ? { maxHeight: `${visibleHeight}px` } : undefined

  return (
    <div className={styles.root} style={rootStyle}>
      {header && <div className={cx(styles.header, entrance && styles.headerIn)}>{header}</div>}
      <div className={cx(styles.body, entrance && styles.bodyStagger)}>{children}</div>
      {footer && <div className={cx(styles.footer, entrance && styles.footerIn)}>{footer}</div>}
    </div>
  )
}
