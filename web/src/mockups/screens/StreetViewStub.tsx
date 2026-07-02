// StreetViewStub — placeholder de Street View para mockups (sin API key).
// Simula la perspectiva de una calle con CSS/SVG puro, sin red.

import { IconGps } from '../icons/MockupIcons'
import styles from './StreetViewStub.module.css'

interface Props {
  /** Chip de lugar centrado arriba (dónde cae el panorama). */
  label?: string
  /** Afordancia sutil de "recentrar en mi ubicación" (GPS) arriba a la derecha. */
  showGps?: boolean
}

export function StreetViewStub({ label, showGps = false }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.buildingLeft} />
      <div className={styles.buildingRight} />
      <div className={styles.road} />
      <div className={styles.vanish} />
      <div className={styles.veil} />
      {label && <div className={styles.label}>{label}</div>}
      {showGps && (
        <span className={styles.gps}>
          <IconGps size={22} />
        </span>
      )}
      <span className={styles.badge}>Street View</span>
    </div>
  )
}
