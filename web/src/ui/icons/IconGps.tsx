// IconGps — crosshair de GPS con punto central teal.
//
// El teal en el centro: "estás aquí". Anillo y brazos de crosshair en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconGps({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      {/* Crosshair arms — stop short of center to let dot breathe */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12"
        y2="22"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="2"
        y1="12"
        x2="7"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="17"
        y1="12"
        x2="22"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Inner ring */}
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
      {/* Accent center dot — teal: tu posición */}
      <circle cx="12" cy="12" r="1.5" fill="var(--color-accent)" />
    </svg>
  )
}
