// IconGlobe — globo terráqueo con marcador de acento teal sobre la superficie.
//
// El acento teal señala "el lugar en el mundo": contenido, no decorativo.
// Líneas de latitud y meridianos en currentColor (peso menor).

interface Props {
  size?: number
  className?: string
}

export function IconGlobe({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Globe outline */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      {/* Latitude lines */}
      <path
        d="M3 12h18M3.5 8h17M3.5 16h17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Longitude lines (meridians) */}
      <path
        d="M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Accent location marker on globe surface — teal: punto de destino */}
      <circle cx="15.5" cy="7.5" r="2" fill="var(--color-accent)" />
      <circle cx="15.5" cy="7.5" r="0.8" fill="currentColor" />
    </svg>
  )
}
