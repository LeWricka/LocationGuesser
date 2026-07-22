// Guía del RETO COMPARTIDO tras el resultado (onboarding nuevo, pieza 2/4).
//
// Rediseño (issue #891): en el revelado ya NO se explica todo aquí. Es UN solo
// paso — un coach-mark BLOQUEANTE que señala el RESULTADO real (la tarjeta de
// puntos, `resultRef`) sin taparlo. Desde él:
//   - "Siguiente" → el llamador (PlayChallenge) navega al VIAJE REAL y arranca
//     allí el tour conducido (Diario → Bitácora → Marcador, ver `GuidedTour` en
//     TripPage). PlayChallenge se desmonta; el resto de la explicación vive en
//     pantallas reales, no en tarjetas de texto.
//   - "Saltar" → directo al Marcador del viaje, SIN registro.
//
// Antes había un segundo coach-mark (el mapa de "los demás") y tres tarjetas de
// texto (`RetoShareExplainSequence`) encadenadas aquí mismo; ambos se retiraron:
// el "qué es Momentu / el viaje entero / el Marcador" se enseña recorriendo el
// viaje de verdad, no leyéndolo. `blocking` se mantiene: aunque el objetivo sea
// una tarjeta (no un mapa vivo), sobre el reveal es más robusto capturar el
// toque que dejar que se cuele a algo de debajo.

import { useEffect, type RefObject } from 'react'
import { useReducedMotion } from '../../ui'
import { CoachMark } from './CoachMark'

export interface Props {
  /** Tarjeta de puntuación del reveal, a resaltar en el coach-mark. */
  resultRef: RefObject<HTMLElement | null>
  /**
   * "Siguiente": el llamador navega al viaje real y arranca el tour conducido.
   */
  onNext: () => void
  /** "Saltar": directo al Marcador del viaje, sin registro. */
  onSkip: () => void
}

export function RetoShareGuide({ resultRef, onNext, onSkip }: Props) {
  const reducedMotion = useReducedMotion()

  // Lleva la tarjeta de puntos a la vista: el reveal scrollea y puede quedar
  // fuera de pantalla. `CoachMark` remide sola cada 400ms, así que el aro encaja
  // aunque el scroll no sea instantáneo (mismo criterio que `GuidedTour`).
  useEffect(() => {
    resultRef.current?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    // Solo al montar: refs y reducedMotion se leen tal cual estén en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CoachMark
      targetRef={resultRef}
      step="Tu resultado"
      title="Este es tu resultado"
      body="Míralo con calma: tus puntos y a qué distancia quedaste del objetivo (cuanto más cerca, más puntos). Cuando quieras, sigue."
      ariaLabel="Este es tu resultado"
      dismissLabel="Saltar"
      primaryAction={{ label: 'Siguiente', onClick: onNext }}
      onDismiss={onSkip}
      // A prueba de balas (issue #888/#891): sobre el reveal capturamos el toque
      // en vez del pass-through de siempre (el usuario solo lee + pulsa).
      blocking
    />
  )
}
