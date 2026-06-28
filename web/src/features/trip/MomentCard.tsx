import { Badge, Button, ChallengePhoto } from '../../ui'
import type { Moment } from '../../lib/trip'
import styles from './MomentCard.module.css'

interface Props {
  moment: Moment
  /** Abre la hoja de detalle del momento (toda la tarjeta es pulsable). */
  onOpen: () => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay?: () => void
}

// Fecha compacta del momento ("8 abr"). Sin año: el viaje suele caber en uno y la
// cabecera ya da contexto. Devuelve null si la fecha no es válida (no rompe nada).
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
function formatMomentDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // Intl añade un punto al mes abreviado ("8 abr."); lo quitamos para el compacto.
  return dateFmt.format(date).replace('.', '')
}

/**
 * Tarjeta de un momento en el carrusel del viaje (anatomía §2 del spec).
 * Foto a sangre con overlay de legibilidad; título + fecha + nº de adivinadores.
 *
 * REGLA DE ORO DEL PIVOTE: jugar es capa, no peaje. Un momento CERRADO se ve y
 * ya (sin CTA); SOLO el momento en juego ofrece "Adivina →". Toda la tarjeta abre
 * el detalle; el CTA es la única acción cálida que tira del ojo hacia el juego.
 */
export function MomentCard({ moment, onOpen, onPlay }: Props) {
  const isActive = moment.status === 'active'
  const date = formatMomentDate(moment.date)

  return (
    <article className={styles.card}>
      {/* La foto NO es zoomable aquí: pulsar la tarjeta abre el detalle, no un
          lightbox (el detalle ya ofrece la foto grande). */}
      <ChallengePhoto
        src={moment.imageUrl}
        alt={moment.title}
        ratio="wide"
        zoomable={false}
        onClick={onOpen}
        className={styles.photo}
      />

      {/* Overlay + contenido sobre la foto. aria-hidden: el contenido textual ya
          vive accesible vía el alt de la foto-botón y el CTA tiene su propia label. */}
      <div className={styles.overlay} aria-hidden="true">
        {isActive && (
          <div className={styles.badge}>
            <Badge tone="live" dot>
              EN JUEGO
            </Badge>
          </div>
        )}
        <div className={styles.body}>
          <p className={styles.title}>{moment.title}</p>
          <div className={styles.meta}>
            {date && <span className={styles.date}>{date}</span>}
            <span className={styles.social}>👤 {moment.guessedCount}</span>
          </div>
        </div>
      </div>

      {/* CTA cálido SOLO si está en juego. Va por encima del overlay para ser
          pulsable; el resto de la tarjeta sigue abriendo el detalle. */}
      {isActive && onPlay && (
        <div className={styles.cta}>
          <Button size="sm" onClick={onPlay}>
            Adivina →
          </Button>
        </div>
      )}
    </article>
  )
}
