import { useEffect, useRef } from 'react'

// Política de navegación "atrás cierra la capa de encima" (issue #967). En una
// SPA con enrutado por hash, las hojas/modales/lightbox que solo viven en
// estado de React NO participan del historial: el atrás del navegador (o el
// swipe-back de iOS/Android, que es el mismo `popstate`) los ignora y navega a
// la entrada anterior — sacando al usuario del viaje o de la app ("al darle
// atrás me saca del viaje", reportado por el dueño). Este hook le da a "hay una
// capa abierta" UNA entrada de historial que el atrás CONSUME cerrándola, en
// vez de navegar.
//
// Modelo de UNA sola entrada (no una por capa) a propósito: las capas de una
// pantalla suelen ser mutuamente excluyentes y, sobre todo, es común cerrar una
// y abrir otra en el mismo gesto (menú → ajustes). Con una entrada por capa, el
// `history.back()` de cerrar la primera pisaría al `pushState` de abrir la
// segunda (una carrera de `popstate`). Tratando "¿hay ALGUNA capa abierta?"
// como un único booleano, ese cierre-y-abre no toca el historial (el booleano
// nunca pasa por `false`), así que no hay carrera. El precedente del flujo de
// crear reto (`CreateLocationChallenge`, issue #592) usa el mismo patrón
// `pushState` + `popstate` para un paso intermedio.
//
// La entrada empujada NO cambia la URL (mismo hash): así no emite `hashchange`
// y el router por hash de `App` no se entera (no re-parsea ni re-renderiza); el
// `popstate` de volver sobre ella tampoco emite `hashchange`. La navegación
// entre PANTALLAS (home→viaje→reto) sigue en manos del hash (cada
// `location.hash = …` empuja su entrada) y no la toca este hook.

/**
 * Da a "hay una capa abierta" una entrada de historial que el gesto atrás
 * consume cerrándola.
 *
 * @param open  `true` mientras haya al menos una capa (hoja/modal/lightbox)
 *   abierta en la pantalla.
 * @param closeTopmost  Cierra la capa de MÁS ARRIBA. Se invoca al detectar el
 *   atrás del navegador (`popstate`). Si tras cerrarla siguen quedando capas
 *   abiertas, `open` seguirá en `true` y este hook re-empuja una entrada para
 *   que el siguiente atrás cierre la siguiente (ver el efecto).
 */
export function useOverlayBack(open: boolean, closeTopmost: () => void): void {
  // El callback se lee por ref para no re-suscribir el efecto (ni tocar el
  // historial) en cada render solo porque el padre recree la función. La ref se
  // actualiza en un efecto (no en render: la regla `react-hooks/refs` prohíbe
  // escribir refs durante el render) — corre antes que cualquier `popstate`.
  const closeRef = useRef(closeTopmost)
  useEffect(() => {
    closeRef.current = closeTopmost
  })

  useEffect(() => {
    if (!open) return

    // Empuja la entrada-centinela SIN cambiar la URL (mismo hash → sin
    // `hashchange`). Es la entrada que el atrás consumirá.
    window.history.pushState({ ...window.history.state, lgOverlayBack: true }, '')

    // ¿El cierre lo provocó el atrás del navegador (`popstate`) o la UI
    // (Escape/scrim/botón)? Solo en el segundo caso hay que deshacer la entrada
    // a mano al desmontar; en el primero el navegador ya la consumió.
    let closedByPop = false
    const onPopState = () => {
      closedByPop = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      // Cierre por UI: nuestra entrada sigue en el tope del historial. La
      // deshacemos para no dejarla colgada (si no, el primer atrás tras cerrar
      // "no haría nada"). El guard sobre `lgOverlayBack` evita robar un back a
      // otra navegación si por lo que sea ya no somos el tope.
      if (!closedByPop && window.history.state?.lgOverlayBack) {
        window.history.back()
      }
    }
  }, [open])
}
