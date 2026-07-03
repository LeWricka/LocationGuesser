// LogoTabide — símbolo de marca "el camino dentro del pin": un pin relleno con una ruta
// punteada en oro que serpentea hasta un destino teal (el viaje, y adónde llega).
//
// Geometría máster validada (issue #538, comentario del dueño): se usa TAL CUAL, sin
// reinterpretar el trazo. A diferencia del resto de iconos del set (currentColor), este
// símbolo tiene paleta propia de marca (grafito/papel + oro + teal) que cambia según el
// fondo sobre el que se apoya — por eso `variant` en vez de heredar color del contexto.
// `mono` sí hereda `currentColor` para los sitios de un solo tono (chips, badges).

type Variant = 'claro' | 'oscuro' | 'mono'

interface Props {
  /**
   * `claro`: pin grafito sobre fondos papel/claros (por defecto).
   * `oscuro`: pin papel sobre fondos oscuros (escenas, overlays sobre el globo).
   * `mono`: todo hereda `currentColor` — para contextos de un solo tono.
   */
  variant?: Variant
  size?: number
  className?: string
  /** Texto accesible del símbolo. */
  title?: string
}

// Paleta fija por variante (issue #538): pin, trazo de ruta, relleno de destino y el
// anillo del destino (separa el círculo teal del pin cuando ambos comparten tono).
const PALETTE: Record<
  'claro' | 'oscuro',
  { pin: string; route: string; dest: string; destRing: string }
> = {
  claro: { pin: '#1F2A30', route: '#D9B96A', dest: '#0F766E', destRing: '#FBFBF9' }, // design-lint-allow: paleta fija de marca (issue #538, geometría máster), no tokens de UI
  oscuro: { pin: '#FBFBF9', route: '#B98A2F', dest: '#0F766E', destRing: '#1F2A30' }, // design-lint-allow: paleta fija de marca (issue #538, geometría máster), no tokens de UI
}

export function LogoTabide({ variant = 'claro', size = 32, className, title = 'Tabide' }: Props) {
  const isMono = variant === 'mono'
  const colors = isMono ? null : PALETTE[variant]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pin: cuerpo del símbolo, grafito (claro) o papel (oscuro) */}
      <path
        d="M32 4C19.3 4 9 14.1 9 26.6 9 42 32 60 32 60s23-18 23-33.4C55 14.1 44.7 4 32 4Z"
        fill={isMono ? 'currentColor' : colors!.pin}
      />
      {/* Ruta punteada en oro: el camino recorrido dentro del pin */}
      <path
        d="M20 40 C20 30, 30 34, 32 26 C34 19, 40 20, 42 15"
        fill="none"
        stroke={isMono ? 'currentColor' : colors!.route}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeDasharray="0.5 7.5"
      />
      {/* Destino: círculo teal con anillo que lo separa del pin */}
      <circle
        cx="43"
        cy="14"
        r="4.6"
        fill={isMono ? 'currentColor' : colors!.dest}
        stroke={isMono ? 'currentColor' : colors!.destRing}
        strokeWidth="2"
      />
    </svg>
  )
}
