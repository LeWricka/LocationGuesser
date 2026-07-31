import { useEffect, useRef } from 'react'
import { isAtHistoryFloor, pushOverlaySentinel } from './overlayBack'

// Política de navegación "atrás cierra la capa de encima" (issue #967, ola 3
// en #972). En una SPA con enrutado por hash, las hojas/modales/lightbox que
// solo viven en estado de React NO participan del historial: el atrás del
// navegador (o el swipe-back de iOS/Android, que es el mismo `popstate`) los
// ignora y navega a la entrada anterior — sacando al usuario de la pantalla o
// de la app ("al darle atrás me saca del viaje", reportado por el dueño). Este
// hook le da a "hay capas abiertas" una entrada de historial que el atrás
// CONSUME cerrando la capa de más arriba, en vez de navegar.
//
// MODELO CON PROFUNDIDAD (ola 3). El hook recibe `depth` = cuántas capas hay
// apiladas (0 = ninguna). Mantiene UNA sola entrada-centinela en el historial
// mientras `depth > 0`; al llegar el atrás cierra la capa de encima y, si aún
// quedan capas por debajo, RE-EMPUJA la centinela para que el siguiente atrás
// cierre la siguiente (lightbox → hoja → pantalla). Así el historial nunca
// acumula más de una entrada nuestra a la vez, pero cada atrás cierra una capa.
//
// Por qué UNA entrada re-empujada y no una por capa: es común cerrar una capa y
// abrir otra en el MISMO gesto (menú → ajustes) — ahí `depth` va 1→1 (o pasa
// por un valor intermedio dentro del mismo commit de React, que se agrupa) y NO
// debe tocar el historial. Con una entrada por nivel, el `history.back()` de
// cerrar la primera pisaría al `pushState` de abrir la segunda (carrera de
// `popstate`). Con una única centinela ligada a "¿hay ALGUNA capa?" (el
// booleano `active = depth > 0`), ese cierre-y-abre no cruza `active`, así que
// el efecto no se re-ejecuta y no hay carrera. El re-empuje SOLO ocurre dentro
// del `popstate` (cuando de verdad se está consumiendo la entrada y aún quedan
// capas): nunca compite con un `history.back()` nuestro.
//
// La entrada empujada NO cambia la URL (mismo hash): así no emite `hashchange`
// y el router por hash de `App` no se entera (no re-parsea ni re-renderiza); el
// `popstate` de volver sobre ella tampoco emite `hashchange`. La navegación
// entre PANTALLAS (home→viaje→reto) sigue en manos del hash (cada
// `location.hash = …` empuja su entrada) y no la toca este hook.
//
// ADELANTE (issue #972.3): tras cerrar con atrás, la centinela pasa a ser una
// entrada-fantasma HACIA DELANTE (mismo hash). Al cerrarse la última capa el
// hook deja de escuchar `popstate`, así que pulsar "adelante" re-navega a esa
// entrada pero NO reabre nada ni deja estado raro: se consume sin efecto
// visible. Se elige "consumir sin efecto" (no "reabrir la capa") a propósito:
// reabrir exigiría serializar QUÉ capa era en el `state` y re-conducir el estado
// de React desde el historial (frágil con capas que dependen de datos vivos);
// el coste de un adelante inerte es nulo frente a ese riesgo.

/**
 * Da a "hay capas abiertas" una entrada de historial que el gesto atrás
 * consume cerrando la capa de más arriba, capa a capa.
 *
 * @param depth  Número de capas apiladas (hoja/modal/lightbox/menú) abiertas
 *   en la pantalla. `0`/`false` = ninguna. Se acepta `boolean` por comodidad
 *   para pantallas de una sola capa (equivale a `1`/`0`); con capas anidadas
 *   pásese el CONTADOR real para que el atrás las cierre una a una.
 * @param closeTopmost  Cierra la capa de MÁS ARRIBA. Se invoca al detectar el
 *   atrás del navegador (`popstate`). Si tras cerrarla siguen quedando capas
 *   (`depth > 1` en el momento del atrás), el hook re-empuja la centinela para
 *   que el siguiente atrás cierre la siguiente.
 */
export function useOverlayBack(depth: number | boolean, closeTopmost: () => void): void {
  const depthNum = typeof depth === 'boolean' ? (depth ? 1 : 0) : depth
  const active = depthNum > 0

  // Callback y profundidad se leen por ref para no re-suscribir el efecto (ni
  // tocar el historial) en cada render solo porque el padre recree la función o
  // cambie `depth` sin cruzar `active`. Las refs se actualizan en un efecto (no
  // en render: la regla `react-hooks/refs` prohíbe escribir refs durante el
  // render) — corre antes que cualquier `popstate`.
  const closeRef = useRef(closeTopmost)
  const depthRef = useRef(depthNum)
  useEffect(() => {
    closeRef.current = closeTopmost
    depthRef.current = depthNum
  })

  useEffect(() => {
    if (!active) return

    // Empuja la entrada-centinela SIN cambiar la URL (mismo hash → sin
    // `hashchange`) y SIN heredar la marca de suelo. Es la entrada que el atrás
    // consumirá.
    pushOverlaySentinel()

    // ¿El cierre lo provocó el atrás del navegador (`popstate`) o la UI
    // (Escape/scrim/botón)? Solo en el segundo caso hay que deshacer la entrada
    // a mano al desmontar; en el primero el navegador ya la consumió.
    let closedByPop = false
    const onPopState = () => {
      // El navegador ya consumió NUESTRA entrada al hacer el atrás. Cerramos la
      // capa de encima…
      closeRef.current()
      // …y si en el momento del atrás quedaban capas POR DEBAJO (`depth > 1`;
      // `depthRef` aún no ha bajado, el cierre de arriba es un setState async),
      // re-empujamos la centinela para que el próximo atrás cierre la siguiente.
      // Si era la última capa, marcamos que el navegador ya consumió la entrada
      // (nada que deshacer en la limpieza).
      if (depthRef.current > 1) {
        pushOverlaySentinel()
      } else {
        closedByPop = true
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      // Cierre por UI (última capa cerrada sin atrás): nuestra entrada sigue en
      // el tope del historial. La deshacemos para no dejarla colgada (si no, el
      // primer atrás tras cerrar "no haría nada"). El guard sobre
      // `lgOverlayBack` evita robar un back a otra navegación si por lo que sea
      // ya no somos el tope.
      //
      // GUARDA DE SUELO (issue #983): jamás emitimos `history.back()` si la
      // entrada actual es el SUELO de la app (la primera de la sesión). Ahí el
      // back no cerraría una capa: sacaría al navegador del documento y lo
      // recargaría en blanco. Puede pasar si la marca de suelo acabó fusionada
      // con `lgOverlayBack` en la misma entrada (p.ej. un `replaceState` de
      // terceros preservando el state mientras reescribe el hash). Preferimos
      // dejar la entrada colgada (un atrás inerte) antes que una recarga: sin
      // `back()`, un atrás posterior del usuario abandona la app con normalidad,
      // sin frame en blanco intermedio.
      if (!closedByPop && window.history.state?.lgOverlayBack && !isAtHistoryFloor()) {
        window.history.back()
      }
    }
  }, [active])
}
