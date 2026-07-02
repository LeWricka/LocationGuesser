// IconMedalla — medalla de competición con cinta y disco.
//
// Sin acento teal por diseño: las medallas de posición tienen sus propios colores
// semánticos (--medal-gold, --medal-silver, --medal-bronze) que se aplican desde
// fuera. Este icono es neutro (currentColor). El caller decide el color.
// rank: pasa a data-rank para que CSS de presentación lo estilice si quiere.

interface Props {
  size?: number
  className?: string
  rank?: 1 | 2 | 3
}

export function IconMedalla({ size = 24, className, rank }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      data-rank={rank}
    >
      {/* Ribbon left */}
      <path d="M9 3L7 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Ribbon right */}
      <path d="M15 3L17 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Ribbon connector top */}
      <path d="M9 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Medal circle */}
      <circle cx="12" cy="15" r="6" stroke="currentColor" strokeWidth="1.8" />
      {/* Medal inner ring */}
      <circle cx="12" cy="15" r="3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
