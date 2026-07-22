// Guía CONDUCIDA (onboarding nuevo, pieza 4/4): encadena varios `CoachMark`
// sobre elementos REALES del viaje de ejemplo, cambiando de pestaña entre
// pasos cuando hace falta (Diario → Bitácora → Marcador). Es el orquestador
// genérico: no sabe nada de "viajes" ni de "pestañas" — cada paso trae su
// propio `targetRef` y un `onBeforeShow` opcional (quien monta `GuidedTour`,
// TripPage, cierra sobre su propio `setSection`). Reutiliza el mecanismo de
// spotlight/medición de `CoachMark` (pieza 3/4) en vez de duplicarlo: la única
// pieza nueva es el "Siguiente" que encadena pasos y la pantalla de cierre.
//
// Respeta `prefers-reduced-motion`: nunca avanza solo (siempre hace falta
// tocar "Siguiente") y el scroll-to-view usa 'auto' en vez de 'smooth'.

import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { useReducedMotion } from '../../ui'
import { CoachMark } from './CoachMark'
import styles from './GuidedTour.module.css'

export interface TourStep {
  /** Nodo REAL a resaltar en ESTE paso (debe existir en el DOM tras `onBeforeShow`). */
  targetRef: RefObject<HTMLElement | null>
  /** Nombre corto del paso ("El Diario", "La liga"…), para el contador. */
  step: string
  title: string
  body: ReactNode
  /** Etiqueta accesible de la burbuja para el lector de pantalla. */
  ariaLabel: string
  /**
   * Se llama ANTES de pintar este paso (incluido el primero): cambia de vista
   * si el objetivo vive en otra pestaña. Si el objetivo está dentro de algo
   * que scrollea, `GuidedTour` lo hace visible después (`scrollIntoView`) —
   * quien define el paso no tiene que ocuparse de eso.
   */
  onBeforeShow?: () => void
}

interface Props {
  steps: TourStep[]
  /** Título/cuerpo de la pantalla de CIERRE (sin objetivo, centrada) tras el
   * último paso. */
  closingTitle: string
  closingBody: ReactNode
  closingCta?: string
  /** Se completó la guía entera (cierre → CTA final). */
  onFinish: () => void
  /** "Saltar" en cualquier paso: sale de la guía sin pasar por el cierre. */
  onSkip: () => void
}

// Margen antes de medir tras cambiar de paso: da tiempo a que `onBeforeShow`
// (que puede montar otra pestaña) termine su render y el nodo objetivo exista
// en el DOM antes de pedirle `scrollIntoView`.
const SETTLE_MS = 60

/**
 * Orquesta la guía: `index` decide qué paso pintar (o, al pasarse del último,
 * la pantalla de cierre). El propio componente no sabe de pestañas ni de
 * viajes — solo encadena `{targetRef, copy, vista a activar}` que le pasa
 * quien lo monta.
 */
export function GuidedTour({
  steps,
  closingTitle,
  closingBody,
  closingCta = 'Terminar',
  onFinish,
  onSkip,
}: Props) {
  const [index, setIndex] = useState(0)
  const reducedMotion = useReducedMotion()
  const total = steps.length
  const current = index < total ? steps[index] : null

  // Al cambiar de paso: aplica la navegación del paso (si la trae) y, con un
  // pequeño margen, hace visible su objetivo si vivía fuera de pantalla (un
  // día de la Bitácora o un hito del Marcador pueden empezar scrolleados).
  // `CoachMark` ya remide sola cada 400ms (ver ese fichero), así que el aro
  // termina de encajar aunque este scroll no sea instantáneo.
  useEffect(() => {
    current?.onBeforeShow?.()
    const id = window.setTimeout(() => {
      current?.targetRef.current?.scrollIntoView({
        block: 'center',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    }, SETTLE_MS)
    return () => window.clearTimeout(id)
    // Solo re-disparar al AVANZAR de paso (`index`): `current`/`reducedMotion`
    // se leen tal cual estén en ese momento, no hace falta re-ejecutar si
    // cambian por otra razón (steps se reconstruye en cada render del padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  if (current) {
    const isLast = index === total - 1
    return (
      <CoachMark
        targetRef={current.targetRef}
        step={`Paso ${index + 1} de ${total} · ${current.step}`}
        title={current.title}
        body={current.body}
        ariaLabel={current.ariaLabel}
        dismissLabel="Saltar"
        primaryAction={{
          label: isLast ? 'Ver cierre' : 'Siguiente',
          onClick: () => setIndex((i) => i + 1),
        }}
        onDismiss={onSkip}
      />
    )
  }

  // Cierre: sin objetivo que resaltar (remata la guía a pantalla completa,
  // como el "tour-closing" del prototipo validado) — el usuario ya recorrió
  // el viaje entero, solo queda confirmar.
  return (
    <div className={styles.closing} role="dialog" aria-modal="true" aria-label={closingTitle}>
      <div className={styles.card}>
        <h3 className={`t-title ${styles.title}`}>{closingTitle}</h3>
        <p className={`t-body ${styles.body}`}>{closingBody}</p>
        <button type="button" className={styles.cta} onClick={onFinish}>
          {closingCta}
        </button>
      </div>
    </div>
  )
}
