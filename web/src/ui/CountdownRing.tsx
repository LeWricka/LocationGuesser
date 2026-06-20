import styles from './CountdownRing.module.css'

interface Props {
  /** Segundos restantes. */
  remaining: number
  /** Segundos totales del reto (para el % del anillo). */
  total: number
  /** Diámetro en píxeles. */
  size?: number
  /** Resalta en rojo/coral cuando queda poco. */
  urgent?: boolean
}

// Anillo de cuenta atrás (data-viz): el trazo se vacía a medida que corre el
// tiempo y el número de segundos vive en el centro. Cálido normalmente; vira a
// coral cuando es urgente. Presentacional: el reloj lo lleva PlayChallenge.
export function CountdownRing({ remaining, total, size = 56, urgent = false }: Props) {
  const stroke = Math.max(4, Math.round(size * 0.08))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0
  const offset = c * (1 - pct)
  const mins = Math.floor(remaining / 60)
  const label = mins > 0 ? `${mins}:${String(remaining % 60).padStart(2, '0')}` : `${remaining}`

  return (
    <div
      className={`${styles.wrap} ${urgent ? styles.urgentWrap : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`Quedan ${remaining} segundos`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(6, 29, 40, 0.55)"
          stroke="rgba(150, 220, 225, 0.2)"
          strokeWidth={stroke}
        />
        <circle
          className={styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#ff7a59' : '#ffb24d'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={`${styles.num} ${urgent ? styles.urgent : ''}`}>{label}</span>
    </div>
  )
}
