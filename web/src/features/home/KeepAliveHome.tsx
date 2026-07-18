import type { ReactNode } from 'react'

interface Props {
  /** ¿Ocultar la home? (issue #847): `true` mientras hay otra ruta pintando encima. */
  hidden: boolean
  children: ReactNode
}

/**
 * Contenedor KEEP-ALIVE de la home (issue #847, estrategia A). Mantiene su subárbol
 * MONTADO —para que el globo MapLibre no se destruya al navegar y volver a la home sea
 * instantáneo— pero lo OCULTA por completo mientras otra ruta ocupa la pantalla.
 *
 * Invariantes del ciclo de vida:
 *  - VISIBLE (`hidden=false`): `display: contents`, así el wrapper NO añade una caja al
 *    layout — la `<main>` de la home se comporta como hija directa y no altera su
 *    `100dvh`/`position: fixed`. Sin `hidden`, `inert` ni `aria-hidden`: home normal.
 *  - OCULTA (`hidden=true`): `display: none` (atributo `hidden` + estilo inline, a prueba
 *    de cualquier reset de CSS que pise `[hidden]`) MÁS `inert` (React 19) para sacar TODO
 *    el subárbol del orden de tabulación, del árbol de accesibilidad y de los eventos de
 *    puntero, con `aria-hidden` como refuerzo. Así ni el foco, ni los lectores, ni axe
 *    ven la home oculta (requisito a11y), y las View Transitions del router NO la capturan
 *    (un `display: none` no se pinta, luego no entra en la "foto" del cross-fade).
 *
 * No pausa el globo por sí mismo: el `display: none` ya evita que MapLibre pinte, y la
 * deriva se pausa vía la prop `active` de HomeGlobe (ver HomePage → HomeGlobe).
 */
export function KeepAliveHome({ hidden, children }: Props) {
  return (
    <div
      hidden={hidden}
      inert={hidden}
      aria-hidden={hidden || undefined}
      style={{ display: hidden ? 'none' : 'contents' }}
    >
      {children}
    </div>
  )
}
