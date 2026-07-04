// IconCalendario — calendario con un día marcado en acento teal.
//
// El teal marca el día elegido: "aquí cae la fecha". Cuerpo, anillas de
// encuadernación y línea de cabecera en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconCalendario({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Calendar body */}
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Binding rings (top clips) */}
      <path d="M8 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Header divider: separa el mes de la rejilla de días */}
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Accent day — teal: el día marcado */}
      <circle cx="8.5" cy="15" r="1.6" fill="var(--color-accent)" />
      {/* Otros días, discretos */}
      <circle cx="12" cy="15" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="15" r="1.1" fill="currentColor" />
    </svg>
  )
}
