import { Badge, Button, ChallengePhoto } from '../../ui'
import type { Moment } from '../../lib/trip'
import styles from './MomentCard.module.css'

interface Props {
  moment: Moment
  /** ¿Es la tarjeta seleccionada (centrada)? Resalta su marco. */
  selected?: boolean
  /** Tocar la foto: selecciona el momento y el mapa hace ZOOM a su pin. */
  onSelect: () => void
  /** Botón "expandir": abre la hoja de detalle (foto grande + texto). */
  onExpand: () => void
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
 * INTERACCIÓN (reconciliación puntos 3/4):
 *  - tocar la FOTO = SELECCIONAR el momento → el mapa hace ZOOM a su pin (acción
 *    primaria, lo que la gente espera del diario visual);
 *  - abrir el detalle (foto grande + texto) es una acción EXPLÍCITA: el botón
 *    "⤢ Ver" arriba a la derecha. Así un toque no dispara a la vez zoom y hoja.
 *
 * REGLA DE ORO DEL PIVOTE: jugar es capa, no peaje. Un momento CERRADO se ve y
 * ya (sin CTA); SOLO el momento en juego ofrece "Adivina →" (única acción cálida).
 */
export function MomentCard({ moment, selected, onSelect, onExpand, onPlay }: Props) {
  const isActive = moment.status === 'active'
  const date = formatMomentDate(moment.date)

  return (
    <article className={[styles.card, selected ? styles.selected : ''].filter(Boolean).join(' ')}>
      {/* Tocar la foto SELECCIONA (mapa hace zoom al pin), no abre la hoja: abrir
          el detalle es el botón "Ver". La foto no es zoomable aquí (eso vive en
          el detalle), su click lo cableamos a la selección. */}
      <ChallengePhoto
        src={moment.imageUrl}
        alt={moment.title}
        ratio="wide"
        zoomable={false}
        onClick={onSelect}
        className={styles.photo}
      />

      {/* Botón explícito de expandir (abre la hoja de detalle). Sobre el overlay y
          SÍ interactivo; el resto de la foto selecciona + hace zoom. */}
      <button type="button" className={styles.expand} onClick={onExpand} aria-label="Ver detalle">
        <span aria-hidden="true">⤢</span>
      </button>

      {/* Overlay + contenido sobre la foto. aria-hidden: el contenido textual ya
          vive accesible vía el alt de la foto-botón y los controles tienen label. */}
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
          pulsable; el resto de la tarjeta sigue seleccionando. */}
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
