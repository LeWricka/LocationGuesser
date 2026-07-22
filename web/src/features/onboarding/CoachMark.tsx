// Coach-mark REUTILIZABLE (onboarding nuevo, pieza 3/4): resalta un elemento
// REAL de la pantalla (spotlight + halo pulsante) y ancla junto a él una
// burbuja con un único paso ("Empieza aquí" → "Guarda tu primer momento…").
// Aprender-haciendo: NO es una pantalla de lista de pasos, es UNA acción
// contextual pegada a lo que el usuario tiene que tocar de verdad — aquí el
// FAB "+" del Diario vacío (ver TripPage), pero deliberadamente genérico
// (recibe un `targetRef`, no sabe nada de FABs ni de viajes) para que la
// pieza 4 (revivir tutoriales desde el perfil) pueda reanclarlo a otros
// elementos reales sin duplicar el motor de spotlight/medición.
//
// Nunca atrapa toques fuera del objetivo: el spotlight/halo son decoración
// `pointer-events: none` — el elemento resaltado sigue siendo el MISMO nodo
// del DOM real, así que tocarlo (a través del hueco visual) dispara su propio
// handler sin que esta capa se interponga. Solo el botón "Saltar guía" captura
// toques.

import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useReducedMotion } from '../../ui'
import styles from './CoachMark.module.css'

export interface CoachMarkProps {
  /** Nodo REAL a resaltar (debe existir en el DOM mientras se muestra el coach-mark). */
  targetRef: RefObject<HTMLElement | null>
  /** Eyebrow corto del paso ("Empieza aquí"). */
  step?: string
  title: string
  body: ReactNode
  /** Copy del cierre. Por defecto "Saltar guía"; la pieza 4 puede pasar otro. */
  dismissLabel?: string
  /** Etiqueta accesible de la burbuja para el lector de pantalla. */
  ariaLabel: string
  onDismiss: () => void
}

// Re-medición barata: el objetivo típico (un FAB `position: fixed`) no se
// mueve con el scroll, pero SÍ puede moverse con la barra de direcciones
// móvil o el teclado (cambia el alto de viewport / safe-area). Un intervalo
// corto es más robusto que un ResizeObserver atado a un nodo que puede tardar
// en existir, y es barato (un getBoundingClientRect, nada de layout thrashing).
const RECHECK_MS = 400
// Si el objetivo está muy arriba, no cabe una burbuja ENCIMA: la bajamos.
const FLIP_BELOW_THRESHOLD_PX = 220
const MARGIN_PX = 16
const RING_PADDING_PX = 10

export function CoachMark({
  targetRef,
  step,
  title,
  body,
  dismissLabel = 'Saltar guía',
  ariaLabel,
  onDismiss,
}: CoachMarkProps) {
  const reducedMotion = useReducedMotion()
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = targetRef.current
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    const id = window.setInterval(measure, RECHECK_MS)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(id)
    }
  }, [targetRef])

  const ringStyle = useMemo(() => {
    if (!rect) return null
    return {
      left: rect.left - RING_PADDING_PX,
      top: rect.top - RING_PADDING_PX,
      width: rect.width + RING_PADDING_PX * 2,
      height: rect.height + RING_PADDING_PX * 2,
    }
  }, [rect])

  const cardStyle = useMemo(() => {
    if (!rect) return null
    const below = rect.top < FLIP_BELOW_THRESHOLD_PX
    return {
      left: MARGIN_PX,
      right: Math.max(MARGIN_PX, window.innerWidth - rect.right),
      ...(below
        ? { top: rect.bottom + MARGIN_PX }
        : { bottom: Math.max(MARGIN_PX, window.innerHeight - rect.top + MARGIN_PX) }),
    }
  }, [rect])

  // Sin objetivo medible todavía (aún no montado, o desapareció): no pintamos
  // nada a medias — mejor un frame sin guía que una burbuja huérfana.
  if (!rect || !ringStyle || !cardStyle) return null

  return (
    <div className={styles.layer}>
      <div className={styles.spotlight} style={ringStyle} />
      {!reducedMotion && <div className={styles.pulse} style={ringStyle} />}

      <div className={styles.card} style={cardStyle} role="note" aria-label={ariaLabel}>
        {step && <span className={`t-label ${styles.step}`}>{step}</span>}
        <h3 className={`t-title ${styles.title}`}>{title}</h3>
        <p className={`t-body ${styles.body}`}>{body}</p>
      </div>

      <button type="button" className={styles.dismiss} onClick={onDismiss}>
        {dismissLabel}
      </button>
    </div>
  )
}
