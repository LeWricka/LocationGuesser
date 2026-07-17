// Helpers de motion presentacional para el UI kit. Sin dependencias: usan APIs
// nativas (View Transitions, matchMedia) para mantener el bundle ligero.

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * Ejecuta un cambio de estado/DOM dentro de una transición de vista para que el
 * navegador haga un cross-fade nativo entre pantallas. Si la API no existe
 * (Firefox hoy) o el usuario pide menos movimiento, ejecuta el callback directo
 * (cambio instantáneo). Es seguro llamarlo siempre.
 *
 * `flushSync` (OB2) es imprescindible aquí: `document.startViewTransition`
 * toma la "foto" del ANTES en cuanto se llama, y la del DESPUÉS en el
 * microtask siguiente a que el callback termine — pero si el callback solo
 * hace `setState` (como aquí, casi siempre), React por defecto NO repinta el
 * DOM de forma síncrona, sino en su próximo batch. Sin `flushSync`, la
 * transición capturaba el DOM VIEJO como "después" (el nuevo llegaba tarde, ya
 * fuera de la captura) y el cross-fade se veía como un salto/parpadeo en vez
 * de un fundido. `flushSync` fuerza el repintado ANTES de que
 * `startViewTransition` tome su segunda foto.
 */
export function withViewTransition(update: () => void): void {
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (prefersReduced || typeof document.startViewTransition !== 'function') {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}

/**
 * Reactivo a `prefers-reduced-motion`. Las animaciones controladas por JS
 * (count-up, dibujo de la línea) lo consultan para saltar a su estado final en
 * vez de animar. El CSS ya lo respeta por su cuenta vía media query.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
