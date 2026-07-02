import { Badge, Button, ChallengePhoto, IconReto } from '../../ui'
import type { Moment } from '../../lib/trip'
import styles from './DiarioFeed.module.css'

interface Props {
  moments: Moment[]
  /** Tocar una tarjeta abre la hoja de detalle. */
  onExpand: (moment: Moment) => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay: (challengeId: string) => void
}

// Formateador de fecha compacto ("8 abr"). Sin año: el viaje suele caber en uno.
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
function formatDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return dateFmt.format(d).replace('.', '')
}

/**
 * Feed foto-first del Diario (estilo Polarsteps).
 *
 * Cada momento pasa del carrusel compacto horizontal a una TARJETA VERTICAL
 * de foto grande (ratio 3:2) con título + lugar + fecha sobre velo.
 *
 * RECUERDO (is_challenge=false): foto a sangre. Sin chip. El título y lugar
 * son siempre visibles (no hay spoiler).
 *
 * RETO CON FOTO: foto a sangre + chip "Reto" (teal, IconReto). Si está EN
 * JUEGO también lleva badge "EN JUEGO" y CTA "Adivina →".
 *
 * RETO SIN FOTO: fondo de escena cartográfica (oscuro, cuadrícula) + chip
 * "Reto" en teal. Diferencia el reto del recuerdo sin hardcodear colores.
 */
export function DiarioFeed({ moments, onExpand, onPlay }: Props) {
  return (
    <div className={styles.feed}>
      {moments.map((m) => (
        <MomentoCard key={m.challengeId} moment={m} onExpand={onExpand} onPlay={onPlay} />
      ))}
    </div>
  )
}

// Tarjeta individual: foto grande a 3:2 con overlay de legibilidad al pie.
// Separada en componente propio para claridad; no se exporta fuera del feature.
function MomentoCard({
  moment,
  onExpand,
  onPlay,
}: {
  moment: Moment
  onExpand: (m: Moment) => void
  onPlay: (challengeId: string) => void
}) {
  const isActive = moment.status === 'active'
  // Reto = lleva mecánica de juego (chip "Reto" visible). Un recuerdo puro no.
  const isReto = moment.isChallenge && moment.status !== 'recuerdo'
  const hasPhoto = moment.imageUrl != null
  const date = formatDate(moment.date)
  const placeName = moment.country?.name ?? null

  return (
    <article className={styles.card}>
      {/* Acción primaria "abrir detalle": botón overlay que cubre la tarjeta. Es
          HERMANO del CTA "Adivina →" (no lo anida), para no crear controles
          interactivos anidados (a11y: nested-interactive). Teclado nativo. */}
      <button
        type="button"
        className={styles.openButton}
        aria-label={moment.title}
        onClick={() => onExpand(moment)}
      />

      {/* Fondo: foto real o escena de reto. */}
      {hasPhoto ? (
        <div className={styles.footoWrapper}>
          <ChallengePhoto src={moment.imageUrl} alt={moment.title} ratio="wide" zoomable={false} />
        </div>
      ) : (
        /* Reto sin foto: escena cartográfica oscura (token --scene-bg + cuadrícula). */
        <div className={styles.retoScene} aria-hidden="true" />
      )}

      {/* Chip "Reto" teal: distingue el reto del recuerdo de un vistazo. */}
      {isReto && (
        <span className={styles.retoChip} aria-label="Reto de ubicación">
          <IconReto size={13} />
          Reto
        </span>
      )}

      {/* Badge "EN JUEGO" en activos: esquina superior derecha. */}
      {isActive && (
        <div className={styles.activeBadge}>
          <Badge tone="live" dot>
            EN JUEGO
          </Badge>
        </div>
      )}

      {/* Velo + texto al pie (título + lugar + fecha). */}
      <div className={styles.overlay} aria-hidden="true">
        <h3 className={styles.titulo}>{moment.title}</h3>
        {(placeName ?? date) && (
          <div className={styles.meta}>
            {placeName && <span>{placeName}</span>}
            {placeName && date && <span className={styles.metaDot}>·</span>}
            {date && <span>{date}</span>}
          </div>
        )}
      </div>

      {/* CTA "Adivina →": solo en retos en juego. Sobre el overlay; el botón
          detiene la propagación para no disparar `onExpand` al mismo tiempo. */}
      {isActive && (
        <div className={styles.cta}>
          <Button size="sm" onClick={() => onPlay(moment.challengeId)}>
            Adivina →
          </Button>
        </div>
      )}
    </article>
  )
}
