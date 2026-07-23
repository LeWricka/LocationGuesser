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
  /**
   * Oculta el botón "Saltar" secundario cuando hay `primaryAction` (issue #908):
   * para un paso TERMINAL (el remate del creador) que solo necesita UN botón
   * claro DENTRO de la burbuja ("Entendido"), no un "Saltar" extra ni el cierre
   * flotante arriba-derecha (que el usuario no asociaba al aviso → "no me deja
   * salir").
   */
  hideSkip?: boolean
  /**
   * Elemento REAL que se mantiene VISIBLE por encima del oscurecido mientras
   * cualquier coach-mark está montado (issue #918: la barra de pestañas del
   * viaje, para que el usuario nunca pierda de vista en qué sección está). La
   * elevación en sí es una señal global que pone este componente (ver el
   * efecto de `data-coachmark-active` más abajo) — no depende de esta prop.
   * `pinnedRef` SOLO alimenta el cálculo de `cardStyle`: sin él, la burbuja
   * podía crecer hacia arriba y acabar tapada DETRÁS del elemento pinneado
   * (que ahora pinta por delante en z-index) cuando el objetivo deja poco
   * hueco por encima (p.ej. el Marcador). Con `pinnedRef`, la burbuja nunca
   * crece más allá de su borde inferior.
   */
  pinnedRef?: RefObject<HTMLElement | null>
}

// Re-medición barata: el objetivo típico (un FAB `position: fixed`) no se
// mueve con el scroll, pero SÍ puede moverse con la barra de direcciones
// móvil o el teclado (cambia el alto de viewport / safe-area). Un intervalo
// corto es más robusto que un ResizeObserver atado a un nodo que puede tardar
// en existir, y es barato (un getBoundingClientRect, nada de layout thrashing).
const RECHECK_MS = 400
const MARGIN_PX = 16
const RING_PADDING_PX = 10
// Margen interior del aro respecto al viewport cuando el objetivo se SALE de la
// pantalla (issue #895): recortarlo a `[0, vw/vh]` dejaba el aro pegado al borde
// y el `.pulse` (glow box-shadow 24px + pulsación `scale(1.06)`, que en un aro a
// pantalla completa desborda ~24px por lado) se salía. 48px = glow (24) + la
// holgura de la pulsación, así el aro Y su glow quedan SIEMPRE dentro. Solo se
// aplica a los lados que DESBORDAN (objetivo gigante, el Diario a pantalla
// completa); un objetivo pequeño pegado a un borde se sigue ciñendo sin
// despegarse (su glow puede rozar el borde, igual que antes).
const RING_VIEWPORT_MARGIN_PX = 48
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
  hideSkip = false,
  pinnedRef,
}: CoachMarkProps) {
  const reducedMotion = useReducedMotion()
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Rect del elemento pinneado (issue #918): se remide junto al objetivo — lo
  // necesita `cardStyle` de abajo para que la burbuja nunca crezca POR ENCIMA
  // de él (si no, con un objetivo que deja poco hueco arriba del todo, como el
  // Marcador, la burbuja se cuela detrás/debajo de la barra de pestañas
  // pinneada y su título queda ilegible, tapado por ella).
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = targetRef.current
      setRect(el ? el.getBoundingClientRect() : null)
      const pinned = pinnedRef?.current
      setPinnedRect(pinned ? pinned.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    const id = window.setInterval(measure, RECHECK_MS)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(id)
    }
  }, [targetRef, pinnedRef])

  // Señal global para subir el elemento pinneado por encima del oscurecido
  // (issue #918): en vez de mutar el ESTILO del nodo de `pinnedRef` directamente
  // (un ref que llega por props — `eslint-plugin-react-hooks` lo trata como
  // mutación de props no permitida, con razón: React no sabe de ese efecto
  // secundario), marcamos `<html>` mientras este coach-mark está montado; quien
  // quiera quedar pinneado (aquí, `.tabs` en TripPage.module.css) decide en su
  // PROPIO CSS cómo reaccionar a esa marca — este componente genérico no
  // necesita saber nada de pestañas ni de viajes, y funciona para CUALQUIER
  // tour por igual, monte o no `pinnedRef` (que aquí solo hace falta para el
  // cálculo de `cardStyle` de abajo).
  useEffect(() => {
    document.documentElement.setAttribute('data-coachmark-active', 'true')
    return () => {
      document.documentElement.removeAttribute('data-coachmark-active')
    }
  }, [])

  // Aro CONTENIDO (issue #888/#895): con un objetivo enorme (el mapa a pantalla
  // completa) el rect + el padding se salía del viewport. Antes recortábamos a
  // [0, vw/vh], pero eso pegaba el aro AL BORDE y su glow (el `.pulse`: box-shadow
  // 24px + `scale(1.06)`) seguía saliéndose. Ahora, SOLO en los lados donde el aro
  // se saldría (objetivo gigante), lo metemos hasta `margin` (deja dentro glow +
  // pulso). A un objetivo pequeño pegado a un borde NO lo despegamos: se sigue
  // ciñendo (su glow puede rozar el borde, como hasta ahora).
  const ringStyle = useMemo(() => {
    if (!rect) return null
    const vw = window.innerWidth
    const vh = window.innerHeight
    const m = RING_VIEWPORT_MARGIN_PX
    let left = rect.left - RING_PADDING_PX
    let top = rect.top - RING_PADDING_PX
    let right = rect.right + RING_PADDING_PX
    let bottom = rect.bottom + RING_PADDING_PX
    if (left < 0) left = m
    if (top < 0) top = m
    if (right > vw) right = vw - m
    if (bottom > vh) bottom = vh - m
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
    // Tope superior real (issue #918): con `pinnedRef` (la barra de pestañas,
    // por delante en z-index — ver el efecto de arriba), el hueco "de verdad"
    // ARRIBA del objetivo no empieza en 0, empieza donde termina lo pinneado —
    // contarlo YA en `spaceAbove` deja que el umbral de "objetivo enorme" de
    // abajo decida bien: con poco hueco (el Marcador) cae sola al patrón
    // clavado-abajo de siempre, en vez de encajar una burbuja tan baja de
    // altura que sus propios botones quedan fuera sin scroll visible.
    const topBound = pinnedRect ? pinnedRect.bottom + MARGIN_PX : 0
    const spaceAbove = rect.top - topBound
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
    // Red de seguridad extra: aunque `spaceAbove` ya descuenta `topBound`, el
    // `min()` con el cálculo en dvh de siempre garantiza que, si aun así se
    // eligiera esta rama, el borde SUPERIOR de la burbuja nunca pase de
    // `pinnedRect.bottom` (sin `pinnedRef` es un no-op: coincide con el cálculo
    // de siempre).
    const maxAbovePinned = Math.max(0, vh - bottom - topBound)
    return {
      ...base,
      bottom,
      maxHeight: `min(calc(100dvh - ${bottom}px - ${MARGIN_PX}px), ${maxAbovePinned}px)`,
    }
  }, [rect, pinnedRect])

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
            {!hideSkip && (
              <button type="button" className={styles.dismissInline} onClick={onDismiss}>
                {dismissLabel}
              </button>
            )}
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
