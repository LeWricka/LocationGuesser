// Ilustraciones SVG propias del flujo de crear reto. Inline (sin assets externos
// por la CSP), con `currentColor` para teñirse con el contexto (acento/tinta) y
// `stroke-width` constante para un trazo editorial fino y coherente entre iconos.
// Reemplazan a los emojis sueltos del sistema (🎯/🗺️/⏱️…) por una familia propia.

interface IconProps {
  /** Lado del cuadrado en px (el SVG es 1:1). Por defecto 24. */
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

// Diana: la RESPUESTA oculta que los demás adivinan. Anillos concéntricos + punto.
export function TargetIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Pin de mapa: marcar el punto en el mapa.
export function PinIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21c4-4.2 6.5-7.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 13.6 8 16.8 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  )
}

// Punto de mira / GPS: "mi ubicación".
export function CrosshairIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  )
}

// Panorama 360 / Street View: óvalo en perspectiva con flechas de giro.
export function PanoramaIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <ellipse cx="12" cy="12" rx="9.5" ry="5.5" />
      <path d="M7.5 9.2A8.6 8.6 0 0 1 12 8c1.7 0 3.2.45 4.5 1.2" />
      <path d="m6.6 8.4-.9 1.7 1.9.3M17.4 8.4l.9 1.7-1.9.3" />
    </svg>
  )
}

// Cámara: la foto del reto.
export function CameraIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h1.6l1-1.6A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .85.4l1 1.6H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  )
}

// Cronómetro: el plazo / la duración del reto.
export function StopwatchIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 7.5l1.3-1.3" />
    </svg>
  )
}

// Reloj de arena: el tiempo POR jugada.
export function HourglassIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 4h10M7 20h10" />
      <path d="M7 4c0 4 5 5.2 5 8 0-2.8 5-4 5-8M7 20c0-4 5-5.2 5-8 0 2.8 5 4 5 8" />
    </svg>
  )
}

// Ojo: la previa "ver cómo se vería al jugar".
export function EyeIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

// Check: medio ya añadido.
export function CheckIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  )
}

// Calendario: las fechas del viaje (salida/vuelta).
export function CalendarIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  )
}

// Gente: los acompañantes del viaje (dos siluetas).
export function PeopleIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19.5c0-2.6-1.4-4.4-3.4-5" />
    </svg>
  )
}

// Pin del viaje: identifica el viaje en el resumen.
export function TripPinIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21c4-4.2 6.5-7.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 13.6 8 16.8 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  )
}

// Destello: la creación / "de qué va" / la microcelebración (sustituye al ✦).
export function SparkIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
