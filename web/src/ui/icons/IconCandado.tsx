// IconCandado — candado cerrado con ojo de cerradura en acento teal.
//
// El teal en el ojo de cerradura: "acceso, pero hay algo dentro".
// Cuerpo y grilletes en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconCandado({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Lock body */}
      <rect
        x="4"
        y="11"
        width="16"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Shackle */}
      <path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Keyhole accent — teal: el acceso tiene valor */}
      <circle cx="12" cy="16" r="1.5" fill="var(--color-accent)" />
      <path d="M12 17.5v1.5" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
