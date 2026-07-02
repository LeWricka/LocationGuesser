// IconPin — teardrop de localización con punto de acento teal interior.
//
// El acento teal solo en el punto: "el lugar" tiene carácter, el contorno es neutro.
// currentColor hereda del padre (color CSS); el dot usa --color-accent (teal).

interface Props {
  size?: number
  className?: string
}

export function IconPin({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Teardrop body */}
      <path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 13 6 13s6-8.5 6-13c0-3.314-2.686-6-6-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Inner accent dot — teal: el punto de interés */}
      <circle cx="12" cy="8" r="2" fill="var(--color-accent)" />
    </svg>
  )
}
