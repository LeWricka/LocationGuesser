import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Icon, useReducedMotion } from '../../ui'
import styles from './Countdown.module.css'

interface Props {
  /** Instante de cierre del reto en ISO (deadline_at). */
  deadlineAt: string
  /** Texto cuando ya venció (por defecto "Cerrado"). */
  closedLabel?: string
}

// Formatea los ms restantes como mm:ss (o hh:mm:ss si pasa de una hora). Tabular
// para que no "baile" el ancho al cambiar de segundo.
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * Cuenta atrás VIVA hasta el cierre de un reto: tic-tac cada segundo, con un
 * micro-rebote en el número al cambiar (clave por segundo). Bajo reduced-motion
 * el rebote se anula (la utilidad global lo desactiva) pero el número sigue vivo.
 * Cuando vence, muestra `closedLabel` y deja de tic-taquear.
 */
export function Countdown({ deadlineAt, closedLabel = 'Cerrado' }: Props) {
  const reducedMotion = useReducedMotion()
  const [now, setNow] = useState(() => Date.now())

  const target = new Date(deadlineAt).getTime()
  const remaining = target - now
  const isClosed = Number.isNaN(target) || remaining <= 0

  useEffect(() => {
    if (isClosed) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [isClosed])

  if (isClosed) {
    return (
      <span className={styles.pill}>
        <Icon icon={Clock} size={14} />
        {closedLabel}
      </span>
    )
  }

  const text = formatRemaining(remaining)
  // La key por segundo remonta el número → reinicia el micro-rebote (salvo reduced).
  const seconds = Math.floor(remaining / 1000)

  return (
    <span className={styles.pill} aria-label={`Cierra en ${text}`}>
      <Icon icon={Clock} size={14} />
      <span className={styles.label}>Cierra en</span>
      <span
        key={reducedMotion ? undefined : seconds}
        className={`${styles.time} ${reducedMotion ? '' : 'lg-count-tick'}`}
      >
        {text}
      </span>
    </span>
  )
}
