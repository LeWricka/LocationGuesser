/*
 * Iconos SVG propios de la sección RETOS (solo los usa TripRetos). Inline, sin
 * red ni assets externos (CSP). Heredan `currentColor` por defecto para vestirse
 * con los tokens de Atelier desde el CSS Module; el oro/plata/bronce del podio se
 * pasan explícitos porque ahí el color SÍ es semántico (medalla).
 *
 * Por qué SVG propio y no emoji: los emojis sueltos (🥇🎯🏆) bajan el listón
 * editorial y se ven dispares entre plataformas. Estos trazos comparten grosor,
 * remate redondeado y métrica → coherencia visual con la voz serif/papel.
 */

interface IconProps {
  /** Tamaño en px (cuadrado). */
  size?: number
  className?: string
}

// Pin/diana de "adivina dónde es": una chincheta de mapa con punto central.
export function PinTargetIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

// Trofeo de la liga: copa con asas y base. Cabecera de la clasificación.
export function TrophyIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5" />
      <path d="M12 13v3.5M9 20h6M9.5 20c0-1.4 1-2.3 2.5-2.3s2.5.9 2.5 2.3" />
    </svg>
  )
}

// Punto "EN JUEGO" latente: doble anillo (el externo se anima por CSS desde el
// llamante con `className`). Relleno sólido al núcleo.
export function LiveDotIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
    </svg>
  )
}

// "Te toca / juega ahora": flecha-cursor con destello, invita al tap. Se usa en
// el CTA de Jugar y donde haga falta un "vamos".
export function PlayBadgeIcon({ size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Medalla del podio (oro/plata/bronce): disco con cinta y estrella grabada. El
// color lo fija el llamante (semántico). Reemplaza los emojis 🥇🥈🥉.
export function MedalIcon({ size = 18, className, rank }: IconProps & { rank: 1 | 2 | 3 }) {
  // Número grabado en el disco para legibilidad (1/2/3) además del color.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* cintas */}
      <path
        d="M9 2.5 7 9M15 2.5 17 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* disco */}
      <circle cx="12" cy="15" r="6.4" fill="currentColor" />
      <circle cx="12" cy="15" r="6.4" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      {/* número grabado */}
      <text
        x="12"
        y="15"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="7.5"
        fontWeight="700"
        fill="rgba(0,0,0,0.42)"
        fontFamily="system-ui, sans-serif"
      >
        {rank}
      </text>
    </svg>
  )
}

// Brújula del estado vacío: ni reto vivo. Ilustración mayor, decorativa.
export function CompassIcon({ size = 56, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="32" cy="32" r="24" opacity="0.85" />
      <circle cx="32" cy="32" r="18.5" opacity="0.3" />
      {/* aguja */}
      <path d="M32 18 38 32 32 46 26 32 32 18Z" fill="currentColor" opacity="0.12" />
      <path d="M32 18 38 32 32 30 26 32 32 18Z" fill="currentColor" stroke="none" />
      <circle cx="32" cy="32" r="2.2" fill="currentColor" stroke="none" />
      {/* marcas cardinales */}
      <path d="M32 7v3M32 54v3M7 32h3M54 32h3" opacity="0.5" />
    </svg>
  )
}

// "Cerrado / resultados": bandera de meta a cuadros. Cabecera de resultados.
export function FlagIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 21V4" />
      <path d="M5 4.5h12l-2.5 3.5L17 11.5H5" fill="currentColor" opacity="0.14" stroke="none" />
      <path d="M5 4.5h12l-2.5 3.5L17 11.5H5" />
    </svg>
  )
}
