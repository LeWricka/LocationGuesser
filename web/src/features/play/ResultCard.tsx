import { forwardRef } from 'react'
import { MapPin } from 'lucide-react'
import { fmtDist } from '../../lib/geo'
import { Icon } from '../../ui'
import styles from './ResultCard.module.css'

interface Props {
  /** Nombre del grupo (si falta, cae al texto neutro "tu grupo"). */
  groupName: string
  /** Título del reto. Es solo el NOMBRE del reto, no su ubicación. */
  challengeTitle: string
  /** Puntos del jugador (protagonista de la tarjeta). */
  points: number
  /** Distancia en km del acierto al objetivo. */
  distanceKm: number
  /** Dominio para el pie (sin protocolo). La imagen no lleva enlace clicable. */
  domain: string
}

// Etiqueta cualitativa por distancia: feedback emocional sin revelar nada del
// sitio (misma escala que el revelado en PlayChallenge). NO es una pista de
// ubicación: solo dice cuánto te acercaste.
function distanceLabel(km: number): string {
  if (km < 1) return '¡Clavado!'
  if (km < 25) return 'Muy cerca'
  if (km < 200) return 'Cerca'
  if (km < 1000) return 'Lejos'
  return 'Muy lejos'
}

/**
 * Tarjeta de MI resultado para compartir como imagen (poster vertical, ancho
 * 1080). La apuesta viral: pica al resto a jugar mostrando SOLO mi rendimiento.
 *
 * NO-SPOILER (requisito duro): la tarjeta nunca pinta la ubicación de la
 * respuesta. Por construcción solo recibe `points`, `distanceKm`, el TÍTULO del
 * reto y el nombre del grupo — ni lat/lng, ni mapa, ni nombre del lugar, ni la
 * foto/escena del reto. La distancia ("a 4,2 km") mide tu acierto, no posiciona
 * nada. Si en el futuro se añadiera un mapa, debe ser decorativo/genérico.
 *
 * Pensada para snapshot con html-to-image: SOLO colores/gradientes/bordes sólidos
 * (sin backdrop-filter/filter/glow) para que la captura salga fiel y nítida. Se
 * monta fuera del viewport a tamaño real; el ref apunta al nodo a rasterizar.
 * Presentacional pura.
 */
export const ResultCard = forwardRef<HTMLDivElement, Props>(function ResultCard(
  { groupName, challengeTitle, points, distanceKm, domain },
  ref,
) {
  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.logoMark} aria-hidden="true">
          <Icon icon={MapPin} size={44} />
        </span>
        <span className={styles.brandName}>Momentu</span>
      </div>

      <div className={styles.header}>
        <span className={styles.eyebrow}>Mi resultado</span>
        <h1 className={styles.challengeTitle}>{challengeTitle}</h1>
        <span className={styles.groupName}>en {groupName}</span>
      </div>

      {/* Bloque protagonista: los PUNTOS gigantes. Es el dato que pica al resto. */}
      <div className={styles.scoreBlock}>
        <span className={styles.points}>{points.toLocaleString('es-ES')}</span>
        <span className={styles.pointsUnit}>puntos</span>
      </div>

      {/* Distancia del acierto (mide cuánto me acerqué, no posiciona nada). */}
      <div className={styles.distBlock}>
        <span className={styles.distLabel}>{distanceLabel(distanceKm)}</span>
        <span className={styles.distValue}>
          a <strong>{fmtDist(distanceKm)}</strong> del objetivo
        </span>
      </div>

      <div className={styles.cta}>¿Lo vives conmigo?</div>

      <div className={styles.footer}>
        <span className={styles.footerCta}>Únete y vívelo</span>
        <span className={styles.footerDomain}>{domain}</span>
      </div>
    </div>
  )
})
