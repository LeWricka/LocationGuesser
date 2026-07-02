// MapStub — placeholder de mapa para mockups sin red ni API key.
// Simula visualmente un mapa con colores y cuadrícula de calles.
// Iconos del set custom (sin emoji).

import { IconPin, IconDiana, IconGps } from '../icons/MockupIcons'
import styles from './MapStub.module.css'

type PinKind = 'pin' | 'diana' | 'none'

interface Props {
  /** Etiqueta de lugar que aparece como chip centrado arriba. */
  label?: string
  /** Marcador central: pin de ubicación, diana de tiro, o ninguno. */
  pin?: PinKind
  /** Mostrar botón GPS (recentrar) en la esquina inferior derecha. */
  showGps?: boolean
}

export function MapStub({ label, pin = 'pin', showGps = false }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.roads} />
      <div className={styles.water} />
      {label && <div className={styles.label}>{label}</div>}
      {pin === 'pin' && <IconPin size={30} className={styles.pin} />}
      {pin === 'diana' && <IconDiana size={30} className={styles.pin} />}
      {showGps && (
        <span className={styles.gps}>
          <IconGps size={22} />
        </span>
      )}
    </div>
  )
}
