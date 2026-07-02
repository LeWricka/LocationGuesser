// IconReto — pin con diana interior: el "reto de ubicación".
//
// Combina el pin (lugar) con la diana (adivina). El centro teal marca el objetivo.
// Teardrop y anillo interior en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconReto({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Pin teardrop */}
      <path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 13 6 13s6-8.5 6-13c0-3.314-2.686-6-6-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Inner target ring */}
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.2" />
      {/* Accent center bull — teal: el punto exacto del reto */}
      <circle cx="12" cy="8" r="1.4" fill="var(--color-accent)" />
    </svg>
  )
}
