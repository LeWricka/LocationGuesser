import { useEffect, useRef, useState } from 'react'
import { Badge, Button, ChallengePhoto } from '../../ui'
import type { Moment } from '../../lib/trip'
import styles from './MomentSheet.module.css'

interface Props {
  /** Momento a mostrar; `null` = hoja cerrada. */
  moment: Moment | null
  onClose: () => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay?: () => void
}

// Fecha larga legible del momento ("8 de abril de 2026"). Null si no es válida.
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
function formatMomentDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return dateFmt.format(date)
}

// Umbral de arrastre (px) a partir del cual soltar cierra la hoja. Por debajo,
// la hoja vuelve a su sitio (gesto cancelado).
const DRAG_CLOSE_PX = 110

/**
 * Hoja de detalle de un momento (bottom sheet, §2 del spec). AUTOCONTENIDA a
 * propósito: no usa el `Modal` compartido para poder subir desde abajo y cerrarse
 * arrastrando, sin tocar ese componente. Foto a sangre arriba + título + fecha +
 * social ligero (lo REAL es el contador de adivinadores) + CTA "Adivina →" solo
 * si el momento está en juego (regla del pivote: jugar es capa, no peaje).
 *
 * Accesibilidad: rol diálogo, cierra con Escape y al tocar el fondo; respeta
 * `prefers-reduced-motion` vía CSS (la animación de subida se anula por media query).
 */
export function MomentSheet({ moment, onClose, onPlay }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Desplazamiento vertical en curso del gesto de arrastre (0 = en su sitio).
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)

  // Cierra reseteando el arrastre, para que la próxima apertura entre limpia
  // (el panel además se remonta por `key`, ver más abajo).
  const close = () => {
    setDragY(0)
    onClose()
  }

  // Cerrar con Escape mientras la hoja está abierta.
  useEffect(() => {
    if (!moment) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `close` es estable salvo por onClose; lo recreamos en cada render pero el
    // listener solo depende de que haya un momento abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment])

  // Bloquea el scroll del FONDO (la pantalla Viaje) mientras la hoja está abierta:
  // así el gesto de scroll solo afecta al contenido de la hoja, nunca a la página
  // de detrás (mismo patrón que Modal/Lightbox). Se restaura al cerrar.
  useEffect(() => {
    if (!moment) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [moment])

  if (!moment) return null

  const isActive = moment.status === 'active'
  const date = formatMomentDate(moment.date)
  // País ya resuelto (solo CERRADOS con coord); con bandera válida para pintarlo.
  const country = moment.country?.flag ? moment.country : null

  // Arrastre desde el asa: seguimos el dedo solo hacia abajo; al soltar, si pasó
  // el umbral cerramos, si no la hoja vuelve a su sitio.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }
  const onPointerUp = () => {
    if (dragStart.current === null) return
    const shouldClose = dragY > DRAG_CLOSE_PX
    dragStart.current = null
    if (shouldClose) close()
    else setDragY(0)
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        // Remontar al cambiar de momento garantiza arrastre/scroll a cero.
        key={moment.challengeId}
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={moment.title}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        // El panel no propaga el click al overlay (que cierra).
        onClick={(e) => e.stopPropagation()}
      >
        {/* Asa de arrastre: zona de gesto para cerrar tirando hacia abajo. */}
        <div
          className={styles.handleZone}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className={styles.handle} aria-hidden="true" />
        </div>

        <div className={styles.content}>
          <div className={styles.photoWrap}>
            <ChallengePhoto
              src={moment.imageUrl}
              alt={moment.title}
              ratio="wide"
              size="lg"
              className={styles.photo}
            />
            {isActive && (
              <div className={styles.photoBadge}>
                <Badge tone="live" dot>
                  EN JUEGO
                </Badge>
              </div>
            )}
          </div>

          <h2 className={styles.title}>{moment.title}</h2>
          {/* Meta-línea estilo Polarsteps: "🇲🇾 MALASIA · 8 de abril de 2026". El país
              solo está si ya se resolvió (CERRADOS con coord); si no, queda solo la
              fecha. El separador "·" únicamente cuando hay ambos. */}
          {(country || date) && (
            <p className={styles.meta}>
              {country && (
                <span className={styles.country}>
                  <span aria-hidden="true">{country.flag}</span> {country.name}
                </span>
              )}
              {country && date && <span aria-hidden="true"> · </span>}
              {date}
            </p>
          )}

          {/* Social ligero. Lo REAL es el contador de adivinadores (derivado de
              votos); ❤/💬 se omiten en v1 por no existir en BD (ver resumen). */}
          <p className={styles.social}>
            <span className={styles.socialIcon} aria-hidden="true">
              👤
            </span>
            {moment.guessedCount}{' '}
            {moment.guessedCount === 1 ? 'persona adivinó' : 'personas adivinaron'}
          </p>

          {isActive && onPlay && (
            <Button size="lg" fullWidth onClick={onPlay} className={styles.cta}>
              Adivina →
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
