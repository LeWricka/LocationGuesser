import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

// Coordinación de "nested scroll" para la hoja del patrón globo + hoja (ver GlobeSheet).
// El gesto de scroll dirige la EXPANSIÓN de la hoja (Apple Maps / Polarsteps): con la hoja
// recogida y el contenido en el tope, un swipe hacia arriba AGRANDA la hoja (mueve el top
// de PEEK hacia RAISED) en vez de scrollear el contenido; una vez arriba (RAISED), el
// gesto fluye al scroll nativo del contenido. A la inversa, con el contenido en el tope y
// la hoja subida, un swipe hacia abajo RECOGE la hoja antes de scrollear.
//
// Por qué un hook con listeners manuales (no `onWheel`/`onTouchMove` de React): para poder
// `preventDefault()` mientras consumimos el delta —y así frenar el scroll nativo del
// contenido y el "scroll chaining"/rebote de la página— los listeners deben ser NO pasivos.
// React registra los suyos como pasivos, donde `preventDefault` es no-op. Por eso los
// añadimos a mano con `{ passive: false }`.

export interface SheetScrollExpandOptions {
  /** Fracción del visor (top de la hoja) en reposo recogida. Mayor = hoja más baja. */
  peek: number
  /** Fracción del visor (top de la hoja) subida del todo. Menor = hoja más alta. */
  raised: number
  /** Ref al elemento scrollable interno de la hoja (`.scroll`). */
  scrollRef: RefObject<HTMLElement | null>
}

export interface SheetScrollExpand {
  /** Fracción actual del top de la hoja (entre `raised` y `peek`). */
  topFrac: number
  /** `true` mientras el gesto está moviendo la hoja (sin transición: sigue al dedo). */
  dragging: boolean
  /** La hoja está en (o cerca de) RAISED. Para el `aria-expanded`/label del asa. */
  raised: boolean
  /** Handlers del asa (arrastre por puntero) — se reparten sobre `.grabZone`. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
  /** Toque simple del asa (sin arrastre real): alterna PEEK↔RAISED. */
  toggle: () => void
}

export function useSheetScrollExpand({
  peek,
  raised: raisedFrac,
  scrollRef,
}: SheetScrollExpandOptions): SheetScrollExpand {
  const [topFrac, setTopFrac] = useState(peek)
  const [dragging, setDragging] = useState(false)

  // La verdad viva del gesto vive en refs (no re-render por frame). `topFracRef` refleja
  // el estado; lo escribimos en cada movimiento y sincronizamos el estado para pintar.
  const topFracRef = useRef(peek)
  const midpoint = (peek + raisedFrac) / 2
  const raised = topFrac <= midpoint

  // Escribe el top (clampeado) tanto en el ref como en el estado (para pintar).
  const setTop = useCallback(
    (next: number) => {
      const clamped = Math.min(peek, Math.max(raisedFrac, next))
      topFracRef.current = clamped
      setTopFrac(clamped)
    },
    [peek, raisedFrac],
  )

  // Engancha a la posición más cercana (PEEK o RAISED). Devuelve la fracción destino.
  const snap = useCallback(() => {
    const target = topFracRef.current <= midpoint ? raisedFrac : peek
    topFracRef.current = target
    setTopFrac(target)
    return target
  }, [midpoint, peek, raisedFrac])

  // ---- Asa: arrastre por puntero (afordancia clásica, se mantiene) --------------------
  const dragStart = useRef<{ y: number; frac: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, frac: topFracRef.current }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStart.current
      if (!start || typeof window === 'undefined') return
      const deltaFrac = (e.clientY - start.y) / window.innerHeight
      setTop(start.frac + deltaFrac)
    },
    [setTop],
  )

  const endPointer = useCallback(() => {
    if (!dragStart.current) return
    dragStart.current = null
    setDragging(false)
    snap()
  }, [snap])

  // Toque simple del asa: alterna entre recogida y subida.
  const toggle = useCallback(() => {
    const target = topFracRef.current > midpoint ? raisedFrac : peek
    topFracRef.current = target
    setTopFrac(target)
  }, [midpoint, peek, raisedFrac])

  // ---- Nested scroll: gesto de scroll sobre el contenido dirige la expansión ----------
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof window === 'undefined') return

    const vh = () => window.innerHeight || 1

    // ¿La hoja está en un extremo? (con tolerancia por el redondeo del snap).
    const atRaised = () => topFracRef.current <= raisedFrac + 0.001
    const atPeek = () => topFracRef.current >= peek - 0.001

    // ¿Debemos consumir un delta de scroll para mover la hoja, en vez de dejar scrollear?
    //  - delta > 0 (dedo/rueda hacia ARRIBA, el contenido "querría" bajar): agranda la
    //    hoja mientras no esté ya RAISED. (Al mover el dedo hacia arriba, en touch el
    //    delta que calculamos es prevY - y > 0.)
    //  - delta < 0 (hacia ABAJO): recoge la hoja solo si el contenido está en el tope y la
    //    hoja está subida; si el contenido tiene scroll por encima, deja scrollear.
    const shouldConsume = (delta: number) => {
      if (delta > 0) return !atRaised()
      if (delta < 0) return el.scrollTop <= 0 && !atPeek()
      return false
    }

    // Aplica un delta en px de gesto a la fracción de la hoja. delta>0 (arriba) agranda la
    // hoja → top disminuye (hacia RAISED). delta<0 (abajo) la recoge → top aumenta.
    const applyDelta = (deltaPx: number) => {
      setTop(topFracRef.current - deltaPx / vh())
    }

    // --- Touch -------------------------------------------------------------------------
    let touchY: number | null = null
    // Mientras controlamos la hoja con el gesto táctil actual: una vez empezamos a mover
    // la hoja, seguimos hasta que el dedo se levante (para no "saltar" a scroll a mitad).
    let controllingSheet = false

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchY = null
        return
      }
      touchY = e.touches[0].clientY
      controllingSheet = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null || e.touches.length !== 1) return
      const y = e.touches[0].clientY
      const delta = touchY - y // >0 dedo hacia ARRIBA (contenido subiría)
      touchY = y

      if (!controllingSheet && !shouldConsume(delta)) return

      controllingSheet = true
      setDragging(true)
      applyDelta(delta)
      // Frenamos el scroll nativo del contenido y el rebote de la página mientras la hoja
      // se mueve (requiere listener no pasivo).
      if (e.cancelable) e.preventDefault()
    }

    const onTouchEnd = () => {
      touchY = null
      if (controllingSheet) {
        controllingSheet = false
        setDragging(false)
        snap()
      }
    }

    // --- Wheel (desktop / trackpad) ----------------------------------------------------
    // El wheel no tiene "soltar": tras el último tick enganchamos con un debounce corto.
    let wheelIdle: ReturnType<typeof setTimeout> | null = null

    const onWheel = (e: WheelEvent) => {
      // deltaY>0 = rueda hacia ABAJO (contenido baja). Para alinear con touch: gesto hacia
      // arriba (agrandar) es deltaY<0. Convertimos a "delta de gesto" con signo de touch:
      // gestoArriba = -deltaY.
      const delta = -e.deltaY
      if (!shouldConsume(delta)) return

      setDragging(true)
      applyDelta(delta)
      if (e.cancelable) e.preventDefault()

      if (wheelIdle) clearTimeout(wheelIdle)
      wheelIdle = setTimeout(() => {
        setDragging(false)
        snap()
        wheelIdle = null
      }, 120)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      if (wheelIdle) clearTimeout(wheelIdle)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [scrollRef, peek, raisedFrac, setTop, snap])

  return {
    topFrac,
    dragging,
    raised,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
    toggle,
  }
}
