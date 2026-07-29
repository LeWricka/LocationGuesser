import type { ReactNode } from 'react'

interface Props {
  /** ¿Ocultar el viaje? (issue #979): `true` mientras hay otra ruta pintando encima
   * (un reto, la home, un flujo de crear) pero queremos conservar este viaje vivo. */
  hidden: boolean
  children: ReactNode
}

/**
 * Contenedor KEEP-ALIVE del ÚLTIMO viaje visitado (issue #979, ola 4 de navegación).
 * Hermano de `KeepAliveHome` (issue #847): mantiene su subárbol MONTADO —para que el
 * globo MapLibre/Leaflet de `TripMap` no se destruya y volver al viaje (reto→atrás→
 * viaje, home→viaje reciente) sea instantáneo, sin flash de canvas ni re-init— pero lo
 * OCULTA por completo mientras otra ruta ocupa la pantalla.
 *
 * Invariantes del ciclo de vida (idénticas a `KeepAliveHome`):
 *  - VISIBLE (`hidden=false`): `display: contents`, así el wrapper NO añade una caja al
 *    layout — la `<main>` del viaje se comporta como hija directa y no altera su
 *    `100dvh`/`position: fixed`. Sin `hidden`, `inert` ni `aria-hidden`: viaje normal.
 *  - OCULTO (`hidden=true`): `display: none` (atributo `hidden` + estilo inline, a prueba
 *    de resets de CSS que pisen `[hidden]`) MÁS `inert` (React 19) para sacar TODO el
 *    subárbol del orden de tabulación, del árbol de accesibilidad y de los eventos de
 *    puntero, con `aria-hidden` de refuerzo. Así ni el foco, ni los lectores, ni axe ven
 *    el viaje oculto, y las View Transitions del router NO lo capturan (un `display: none`
 *    no se pinta, luego no entra en la "foto" del cross-fade).
 *
 * No pausa el mapa por sí mismo: el `display: none` ya evita que MapLibre pinte; la
 * cámara/animaciones se detienen y se revalida el tamaño del lienzo vía la prop `active`
 * de `TripPage` → `TripMap` (ver TripMapGlobe/TripMapLeaflet).
 */
export function KeepAliveTrip({ hidden, children }: Props) {
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
