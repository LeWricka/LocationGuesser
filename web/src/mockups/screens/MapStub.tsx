// MapStub — placeholder de mapa para mockups sin red ni API key.
// Simula visualmente un mapa con colores y cuadrícula de calles.

import styles from './MapStub.module.css'

interface Props {
  /** Etiqueta de lugar que aparece como chip centrado arriba. */
  label?: string
  /** Emoji del pin central. Por defecto 📍. */
  pinEmoji?: string
  /** Mostrar botón GPS en la esquina inferior derecha. */
  showGps?: boolean
}

export function MapStub({ label, pinEmoji = '📍', showGps = false }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.grid} />
      <div className={styles.roads} />
      <div className={styles.water} />
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.pin}>{pinEmoji}</div>
      {showGps && <div className={styles.gps}>◎</div>}
    </div>
  )
}
