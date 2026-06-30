import { useEffect, useState } from 'react'

export interface VisualViewportState {
  /**
   * Alto REAL visible en px (lo que el usuario ve), descontando el teclado del
   * sistema y el chrome del navegador. Es lo que `100dvh` no siempre acierta
   * cuando el teclado está abierto. `null` hasta que se mide en el cliente.
   */
  height: number | null
  /**
   * `true` cuando el teclado (o cualquier overlay del sistema) recorta el
   * viewport visible de forma notable respecto a la ventana.
   */
  keyboardOpen: boolean
  /**
   * Px recortados por abajo (alto de ventana − alto visible − desplazamiento).
   * Útil para empujar una hoja/barra de acción por encima del teclado.
   */
  offsetBottom: number
}

// Umbral en px para considerar que el viewport recortado es el teclado y no un
// simple reajuste del chrome del navegador (que mueve pocos px).
const KEYBOARD_THRESHOLD = 120

function readViewport(): VisualViewportState {
  // SSR / navegadores sin la API: caemos a innerHeight y "sin teclado".
  if (typeof window === 'undefined' || !window.visualViewport) {
    const height = typeof window === 'undefined' ? null : window.innerHeight
    return { height, keyboardOpen: false, offsetBottom: 0 }
  }
  const vv = window.visualViewport
  // Lo que queda recortado por abajo = ventana − (alto visible + cuánto se ha
  // desplazado el viewport hacia arriba). Es donde se "come" el teclado.
  const offsetBottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
  return {
    height: vv.height,
    keyboardOpen: offsetBottom > KEYBOARD_THRESHOLD,
    offsetBottom,
  }
}

/**
 * Expone el alto visible real y si el teclado está abierto, vía la API
 * `visualViewport`. Las alturas en `vh`/`%` colapsan cuando aparece el teclado
 * del sistema o la barra del navegador y empujan el contenido fuera de pantalla;
 * con esto, hojas y pantallas inmersivas pueden reajustarse al alto que el
 * usuario ve de verdad. Donde la API no existe, devuelve un estado seguro
 * (sin teclado) y no rompe nada.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => readViewport())

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setState(readViewport())
    // Una medición inicial: el primer render pudo ser SSR/antes de pintar.
    update()
    // `resize` cubre teclado y rotación; `scroll` cubre el paneo del propio
    // viewport (iOS desplaza el visual viewport al enfocar inputs).
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return state
}
