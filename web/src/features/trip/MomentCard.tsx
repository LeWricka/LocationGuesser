import { Badge, Button, ChallengePhoto } from '../../ui'
import type { Moment } from '../../lib/trip'
import styles from './MomentCard.module.css'

interface Props {
  moment: Moment
  /** ¿Es la tarjeta seleccionada (centrada)? Resalta su marco. */
  selected?: boolean
  /** Tocar la foto: centra su pin en el mapa Y abre la hoja de detalle (foto grande). */
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
 *    "Ver detalle" (icono expandir) arriba a la derecha. Así un toque no dispara
 *    a la vez zoom y hoja.
 *
 * RECUERDO vs RETO (separación contenido/reto):
 *  - un RECUERDO (`is_challenge = false`) es solo contenido: foto + lugar visible +
 *    fecha, SIN "Adivina" ni cuenta atrás. No lleva chip de reto.
 *  - un RETO lleva chip "🎯 Reto" para distinguirlo; si está EN JUEGO añade el badge
 *    "EN JUEGO" y la única acción cálida "Adivina →" (regla del pivote: jugar es
 *    capa, no peaje — un reto ya cerrado se ve y ya).
 */
export function MomentCard({ moment, selected, onExpand, onPlay }: Props) {
  const isActive = moment.status === 'active'
  // Lleva capa de reto (en juego, cerrado o práctica) → chip "🎯 Reto". Un recuerdo
  // puro no lo lleva: la tarjeta lee como contenido, no como juego.
  const isReto = moment.isChallenge && moment.status !== 'recuerdo'
  // Recuerdo puro (contenido, no juego): ni reto ni en juego → marca de filete
  // izquierdo para diferenciarlo de un vistazo del contenido de juego.
  const isRecuerdo = !isReto && !isActive
  const date = formatMomentDate(moment.date)

  return (
    <article
      className={[styles.card, selected ? styles.selected : '', isRecuerdo ? styles.recuerdo : '']
        .filter(Boolean)
        .join(' ')}
    >
      {/* Tocar la foto CENTRA su pin en el mapa y ABRE la hoja de detalle (foto en
          grande). Un solo gesto claro — sin botón de "ampliar" suelto, que se perdía
          sobre fotos claras. El zoom real de la imagen vive ya en el detalle. */}
      <ChallengePhoto
        src={moment.imageUrl}
        alt={moment.title}
        ratio="wide"
        zoomable={false}
        onClick={onExpand}
        className={styles.photo}
      />

      {/* Bandera del país en disco de vidrio, esquina sup-izq (estilo Polarsteps).
          Solo aparece cuando el país ya se ha resuelto (CERRADOS con coord); si aún
          no hay, no pintamos nada (sin placeholder). No colisiona con el badge EN
          JUEGO porque los activos no tienen coord ni país. */}
      {moment.country?.flag && (
        <div className={styles.flag} aria-hidden="true">
          <span className={styles.flagEmoji}>{moment.country.flag}</span>
        </div>
      )}

      {/* Overlay + contenido sobre la foto. aria-hidden: el contenido textual ya
          vive accesible vía el alt de la foto-botón y los controles tienen label. */}
      <div className={styles.overlay} aria-hidden="true">
        <div className={styles.body}>
          {/* Chip de estado, sobre el título (no colisiona con la bandera sup-izq ni
              el botón expandir sup-der). Un reto EN JUEGO lleva "EN JUEGO" (cálido,
              pulsa); un reto cerrado/práctica, el chip "🎯 Reto" que lo distingue del
              recuerdo. Un recuerdo no lleva chip: lee como contenido, no como juego. */}
          {isActive ? (
            <span className={styles.chip}>
              <Badge tone="live" dot>
                EN JUEGO
              </Badge>
            </span>
          ) : isReto ? (
            <span className={styles.chip}>
              <Badge tone="accent">🎯 Reto</Badge>
            </span>
          ) : null}
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
