// IconCamara — cámara con objetivo de acento teal.
//
// El teal marca el objetivo: "aquí se captura el momento".
// Cuerpo, bump del visor y flash en currentColor.

interface Props {
  size?: number
  className?: string
}

export function IconCamara({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Camera body */}
      <rect
        x="2"
        y="7"
        width="20"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Viewfinder bump */}
      <path
        d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lens ring */}
      <circle cx="12" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      {/* Accent lens inner — teal: el ojo de la cámara */}
      <circle cx="12" cy="14" r="1.6" fill="var(--color-accent)" />
      {/* Flash dot */}
      <circle cx="18.5" cy="10.5" r="0.9" fill="currentColor" />
    </svg>
  )
}
