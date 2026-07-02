// StreetViewStub — placeholder de Street View para mockups (sin API key).
// Simula la perspectiva de una calle con CSS/SVG puro, sin red.

import styles from './StreetViewStub.module.css'

export function StreetViewStub() {
  return (
    <div className={styles.root}>
      <div className={styles.buildingLeft} />
      <div className={styles.buildingRight} />
      <div className={styles.road} />
      <div className={styles.vanish} />
      <div className={styles.veil} />
      <span className={styles.badge}>Street View</span>
    </div>
  )
}
