import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'
import styles from './ScoreRing.module.css'

interface Props {
  /** Valor a representar (p.ej. puntos del reto). */
  value: number
  /** Máximo de la escala para el porcentaje del anillo (puntuación máxima). */
  max: number
  /** Diámetro del anillo en píxeles. */
  size?: number
  /** Contenido central (normalmente el número y su unidad). */
  children?: React.ReactNode
  className?: string
}

// Anillo de progreso SVG (data-viz): dibuja el % `value/max` con el degradado
// cálido de marca sobre una pista fría. El trazo se anima "rellenándose" al
// montar (stroke-dashoffset). Bajo prefers-reduced-motion aparece ya completo.
// Presentacional: no calcula scoring, solo lo visualiza.
export function ScoreRing({ value, max, size = 96, children, className }: Props) {
  const reduced = useReducedMotion()
  const stroke = Math.max(6, Math.round(size * 0.085))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0

  // Animación de "relleno": arranca vacío (offset = circunferencia) y, tras
  // montar, se asienta en el offset destino vía transición CSS. Bajo
  // reduced-motion `filled` ya nace en true (sin animación, anillo completo).
  const [filled, setFilled] = useState(reduced)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    if (reduced) return
    // rAF tras el montaje: el navegador pinta primero el offset vacío y luego
    // anima al destino (el setState va en el callback, no síncrono en el effect).
    raf.current = requestAnimationFrame(() => setFilled(true))
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [reduced])

  const offset = filled ? c * (1 - pct) : c

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="lg-score-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc36b" />
            <stop offset="1" stopColor="#ff7a59" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(150, 220, 225, 0.18)"
          strokeWidth={stroke}
        />
        <circle
          className={styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#lg-score-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.center}>{children}</div>
    </div>
  )
}
