// Coach-mark REUTILIZABLE (onboarding nuevo, pieza 3/4): resalta un elemento
// REAL de la pantalla (spotlight + halo pulsante) y ancla junto a él una
// burbuja con un único paso ("Empieza aquí" → "Guarda tu primer momento…").
// Aprender-haciendo: NO es una pantalla de lista de pasos, es UNA acción
// contextual pegada a lo que el usuario tiene que tocar de verdad — aquí el
// FAB "+" del Diario vacío (ver TripPage), pero deliberadamente genérico
// (recibe un `targetRef`, no sabe nada de FABs ni de viajes) para que la
// pieza 4 (revivir tutoriales desde el perfil) pueda reanclarlo a otros
// elementos reales sin duplicar el motor de spotlight/medición. `GuidedTour`
// (pieza 4/4, viaje de ejemplo) encadena varios de estos pasos añadiendo
// `primaryAction` ("Siguiente"): el resto de usos (creador) no lo pasan y
// se quedan con el único botón de cierre de siempre.
//
// Nunca atrapa toques fuera del objetivo: el spotlight/halo son decoración
// `pointer-events: none` — el elemento resaltado sigue siendo el MISMO nodo
// del DOM real, así que tocarlo (a través del hueco visual) dispara su propio
// handler sin que esta capa se interponga. Solo los botones de acción (cierre
// y, si lo hay, "Siguiente") capturan toques.
//
// MODO `blocking` (issue #888, aditivo): sobre un objetivo vivo e interactivo
// por naturaleza —un mapa Leaflet— el pass-through de arriba es un desastre:
// arrastra el mapa en vez de avanzar de paso, y el "Siguiente" puede acabar
// recibiendo el toque el propio mapa (capas de Leaflet por debajo). Con
// `blocking`, la capa entera pasa a `pointer-events:auto`: captura CUALQUIER
// toque por debajo (el objetivo no necesita ser interactivo, el usuario solo
// lee + pulsa "Siguiente") y así nunca se cuela al elemento real. Sin esta
// prop el comportamiento de siempre queda intacto (creador, FAB "+").

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
  /**
   * Acción PRIMARIA opcional junto al cierre (p.ej. "Siguiente" de `GuidedTour`,
   * pieza 4/4). Sin ella, el coach-mark se queda con el único botón de cierre
   * de siempre (creador, pieza 3/4) — puramente aditivo.
   */
  primaryAction?: { label: string; onClick: () => void }
  /** Etiqueta accesible de la burbuja para el lector de pantalla. */
  ariaLabel: string
  onDismiss: () => void
  /**
   * Modo bloqueante (issue #888): captura toda interacción por debajo (scrim
   * `pointer-events:auto`) en vez del pass-through de siempre. Pensado para
   * objetivos vivos/interactivos (mapa Leaflet) donde dejar pasar el toque
   * arrastra el mapa en vez de avanzar. Default `false` = comportamiento
   * intacto (creador, FAB "+").
   */
  blocking?: boolean
}

// Re-medición barata: el objetivo típico (un FAB `position: fixed`) no se
// mueve con el scroll, pero SÍ puede moverse con la barra de direcciones
// móvil o el teclado (cambia el alto de viewport / safe-area). Un intervalo
// corto es más robusto que un ResizeObserver atado a un nodo que puede tardar
// en existir, y es barato (un getBoundingClientRect, nada de layout thrashing).
const RECHECK_MS = 400
const MARGIN_PX = 16
const RING_PADDING_PX = 10
// Hueco mínimo (px) para que la burbuja quepa cómoda a un lado del objetivo.
// Con un objetivo ENORME (el mapa a pantalla completa, modo `blocking`) ni
// arriba ni abajo hay tanto hueco: en ese caso la clavamos al borde inferior
// del viewport con su propio scroll (nunca fuera de pantalla, issue #888).
const MIN_CARD_SPACE_PX = 180

export function CoachMark({
  targetRef,
  step,
  title,
  body,
  dismissLabel = 'Saltar guía',
  primaryAction,
  ariaLabel,
  onDismiss,
  blocking = false,
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

  // Aro CONTENIDO (issue #888): con un objetivo enorme (el mapa a pantalla
  // completa) el rect + el padding se salía del viewport ("cuadrado dorado
  // que se sale del mapa"). Recortamos a [0, innerWidth/Height] tras aplicar
  // el padding, así el aro nunca se desborda.
  const ringStyle = useMemo(() => {
    if (!rect) return null
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.max(0, rect.left - RING_PADDING_PX)
    const top = Math.max(0, rect.top - RING_PADDING_PX)
    const right = Math.min(vw, rect.right + RING_PADDING_PX)
    const bottom = Math.min(vh, rect.bottom + RING_PADDING_PX)
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }, [rect])

  // Burbuja SIEMPRE dentro del viewport (issue #888): antes se decidía
  // arriba/abajo con un umbral fijo sobre `rect.top` y sin tope — con un
  // objetivo alto (el mapa) la burbuja podía acabar fuera de pantalla. Ahora
  // comparamos el hueco REAL a cada lado y, si ninguno alcanza
  // `MIN_CARD_SPACE_PX` (objetivo enorme), la clavamos al borde inferior con
  // su propio scroll. Los dos lados "normales" también llevan `maxHeight` +
  // scroll propio como red de seguridad (nunca fuera de pantalla, aunque el
  // contenido crezca).
  const cardStyle = useMemo(() => {
    if (!rect) return null
    const vw = window.innerWidth
    const vh = window.innerHeight
    const spaceAbove = rect.top
    const spaceBelow = vh - rect.bottom
    const base = {
      left: MARGIN_PX,
      right: Math.max(MARGIN_PX, vw - rect.right),
      maxHeight: `calc(100dvh - ${MARGIN_PX * 2}px)`,
      overflowY: 'auto' as const,
    }
    if (spaceAbove < MIN_CARD_SPACE_PX && spaceBelow < MIN_CARD_SPACE_PX) {
      return {
        ...base,
        bottom: MARGIN_PX,
        maxHeight: `min(50dvh, calc(100dvh - ${MARGIN_PX * 2}px))`,
      }
    }
    if (spaceBelow >= spaceAbove) {
      const top = Math.min(rect.bottom + MARGIN_PX, Math.max(MARGIN_PX, vh - MIN_CARD_SPACE_PX))
      return { ...base, top, maxHeight: `calc(100dvh - ${top}px - ${MARGIN_PX}px)` }
    }
    const bottom = Math.max(MARGIN_PX, vh - rect.top + MARGIN_PX)
    return { ...base, bottom, maxHeight: `calc(100dvh - ${bottom}px - ${MARGIN_PX}px)` }
  }, [rect])

  // Sin objetivo medible todavía (aún no montado, o desapareció): no pintamos
  // nada a medias — mejor un frame sin guía que una burbuja huérfana.
  if (!rect || !ringStyle || !cardStyle) return null

  return (
    <div className={`${styles.layer} ${blocking ? styles.layerBlocking : ''}`}>
      <div className={styles.spotlight} style={ringStyle} />
      {!reducedMotion && <div className={styles.pulse} style={ringStyle} />}

      <div className={styles.card} style={cardStyle} role="note" aria-label={ariaLabel}>
        {step && <span className={`t-label ${styles.step}`}>{step}</span>}
        <h3 className={`t-title ${styles.title}`}>{title}</h3>
        <p className={`t-body ${styles.body}`}>{body}</p>

        {/* Fila de acciones DENTRO de la burbuja (hereda su posición, sin cálculo
            propio): con `primaryAction` (GuidedTour, pieza 4/4), "Saltar" convive
            con "Siguiente"; el botón de cierre en solitario del creador (pieza
            3/4) se queda flotando arriba-derecha, fuera de la burbuja (`.dismiss`). */}
        {primaryAction && (
          <div className={styles.actions}>
            <button type="button" className={styles.dismissInline} onClick={onDismiss}>
              {dismissLabel}
            </button>
            <button type="button" className={styles.primary} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          </div>
        )}
      </div>

      {!primaryAction && (
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          {dismissLabel}
        </button>
      )}
    </div>
  )
}
