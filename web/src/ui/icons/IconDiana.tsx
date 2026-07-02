// IconDiana — diana con punto central de acento teal.
//
// El teal marca el bull's-eye: el objetivo, la respuesta correcta.
// Dos anillos y cuatro brazos de mira en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconDiana({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      {/* Middle ring */}
      <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      {/* Crosshair top/bottom */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="18"
        x2="12"
        y2="22"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Crosshair left/right */}
      <line
        x1="2"
        y1="12"
        x2="6"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="12"
        x2="22"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Accent bull center — teal: impacto exacto */}
      <circle cx="12" cy="12" r="2.2" fill="var(--color-accent)" />
    </svg>
  )
}
