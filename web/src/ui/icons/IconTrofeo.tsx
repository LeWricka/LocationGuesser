// IconTrofeo — copa de trofeo con estrella de acento teal en el interior.
//
// El acento teal en la estrella: el premio tiene brillo sin competir con las fotos.
// Copa, asas y base en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconTrofeo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Trophy bowl */}
      <path
        d="M7 3h10v7a5 5 0 0 1-10 0V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Handles */}
      <path
        d="M7 5H5a2 2 0 0 0 0 4h2M17 5h2a2 2 0 0 0 0 4h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Stem */}
      <path d="M12 15v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Base */}
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Accent star highlight in bowl — teal: la victoria */}
      <path
        d="M12 6l.75 2h2l-1.6 1.2.6 2-1.75-1.2L10.25 11.2l.6-2L9.25 8h2L12 6Z"
        fill="var(--color-accent)"
      />
    </svg>
  )
}
