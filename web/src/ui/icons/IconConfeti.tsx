// IconConfeti — pítalo de fiesta con confeti bicromático.
//
// Confeti en currentColor y en teal: dos tonos sin saturación excesiva.
// El teal en detalles pequeños (partículas) — no en el cono principal.

interface Props {
  size?: number
  className?: string
}

export function IconConfeti({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Party popper cone */}
      <path d="M3 21L10.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3 21l6-.5-5.5-5.5L3 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      {/* Confetti pieces — currentColor */}
      <rect
        x="13"
        y="2"
        width="2"
        height="2"
        rx="0.4"
        fill="currentColor"
        transform="rotate(20 13 2)"
      />
      <rect
        x="18"
        y="6"
        width="2"
        height="2"
        rx="0.4"
        fill="currentColor"
        transform="rotate(-15 18 6)"
      />
      <circle cx="11" cy="6" r="1" fill="currentColor" />
      {/* Confetti pieces — teal accent: chispa de celebración */}
      <rect
        x="16"
        y="2"
        width="2"
        height="2"
        rx="0.4"
        fill="var(--color-accent)"
        transform="rotate(-30 16 2)"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="2"
        rx="0.4"
        fill="var(--color-accent)"
        transform="rotate(25 20 10)"
      />
      <circle cx="14" cy="9" r="1" fill="var(--color-accent)" />
      {/* Streamers */}
      <path d="M12 13c1-2 4-3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M14 15c2-1 4-1 5-3"
        stroke="var(--color-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
