import styles from './Medal.module.css'

type Rank = 1 | 2 | 3

interface Props {
  /** Puesto en el podio: 1, 2 o 3. */
  rank: Rank
  /** Lado en px del cuadro. Por defecto 24 (alineado con Icon). */
  size?: number
  className?: string
}

// Medalla de podio como SVG de línea propio: sustituye a los emojis 🥇🥈🥉
// (que rompen el "sin emoji" del sistema y se ven distintos por plataforma).
// Dos cintas + un disco con el número del puesto. El color sale de los tokens
// --medal-* (oro/plata/bronce ya calibrados a papel); nada hardcodeado.
const RANK_LABEL: Record<Rank, string> = {
  1: 'Primer puesto',
  2: 'Segundo puesto',
  3: 'Tercer puesto',
}

export function Medal({ rank, size = 24, className }: Props) {
  const classes = [styles.medal, styles[`rank-${rank}`], className].filter(Boolean).join(' ')
  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={RANK_LABEL[rank]}
    >
      {/* Cintas que cuelgan hacia el disco. */}
      <path d="M8.5 3.5 6 8.5" />
      <path d="M15.5 3.5 18 8.5" />
      {/* Disco de la medalla. */}
      <circle cx="12" cy="15" r="6" />
      {/* Número del puesto, centrado en el disco (sin stroke, solo relleno). */}
      <text
        x="12"
        y="15"
        className={styles.number}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
      >
        {rank}
      </text>
    </svg>
  )
}
