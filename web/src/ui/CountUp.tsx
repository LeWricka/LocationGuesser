import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'

interface Props {
  /** Valor final al que cuenta. */
  value: number
  /** Duración del conteo en ms. */
  duration?: number
  /** Locale para el formateo de miles (es-ES por defecto). */
  locale?: string
  className?: string
}

// Número que cuenta desde 0 hasta `value` con easing (out-cubic), para que la
// puntuación "suba" al revelar el resultado. Bajo prefers-reduced-motion o sin
// requestAnimationFrame, muestra el valor final directo. Guardamos el progreso
// (0..1) en estado vía rAF y derivamos el número en el render (sin setState
// síncrono en el cuerpo del efecto).
export function CountUp({ value, duration = 900, locale = 'es-ES', className }: Props) {
  const reduced = useReducedMotion()
  const [progress, setProgress] = useState(0)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === 'undefined') return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setProgress(t)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current)
    }
  }, [value, duration, reduced])

  // easeOutCubic: arranca rápido y desacelera al llegar (sensación física).
  const eased = 1 - Math.pow(1 - progress, 3)
  const display = reduced ? value : Math.round(value * eased)

  return <span className={className}>{display.toLocaleString(locale)}</span>
}
