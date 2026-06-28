import styles from './Compass.module.css'

interface Props {
  /** Orientación actual de la vista en grados (0 = Norte, 90 = Este). */
  heading: number
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

// Heading → punto cardinal (8 sectores de 45°). Normaliza a [0,360).
function cardinal(heading: number): string {
  const h = ((heading % 360) + 360) % 360
  return DIRS[Math.round(h / 45) % 8]
}

// Brújula flotante: punto cardinal + aguja roja que apunta a
// donde mira el jugador. La aguja rota CON el panorama (heading). Presentacional:
// el heading lo provee PlayChallenge desde el panorama.
export function Compass({ heading }: Props) {
  return (
    <div className={styles.compass} role="img" aria-label={`Mirando hacia ${cardinal(heading)}`}>
      <span className={styles.label}>{cardinal(heading)}</span>
      <svg className={styles.dial} viewBox="0 0 36 36" width={36} height={36} aria-hidden="true">
        <circle cx="18" cy="18" r="16" className={styles.dialRing} />
        {/* La aguja gira al revés del heading: el panorama "rota" bajo una aguja
            que siempre apunta a la dirección de la mirada respecto al norte de la
            esfera. Norte arriba => rotar la aguja `heading` grados. */}
        <g style={{ transform: `rotate(${heading}deg)`, transformOrigin: '18px 18px' }}>
          <polygon points="18,4 22,18 18,15 14,18" className={styles.needleN} />
          <polygon points="18,32 14,18 18,21 22,18" className={styles.needleS} />
        </g>
      </svg>
    </div>
  )
}
