// Guía del RETO COMPARTIDO tras el resultado (onboarding nuevo, pieza 2/4).
//
// Rediseño (issue #891): en el revelado ya NO se explica todo aquí. Issue
// #899: DOS pasos — primero un coach-mark BLOQUEANTE sobre el resultado real
// (tu posición: dónde colocaste el pin vs el objetivo), y luego uno sobre la
// lista de la clasificación + tu puntuación ("cómo vais"). Antes había un
// único paso que apuntaba solo al mapa; los puntos quedaban "a la vista
// debajo" sin que nada los señalara — el 2º paso corrige eso. Desde el 2º paso:
//   - "Siguiente" → el llamador (PlayChallenge) navega al VIAJE REAL y arranca
//     allí el tour conducido (Diario → Bitácora → Marcador, ver `GuidedTour` en
//     TripPage). PlayChallenge se desmonta; el resto de la explicación vive en
//     pantallas reales, no en tarjetas de texto.
//   - "Saltar" (en cualquiera de los 2 pasos) → directo al Marcador del viaje,
//     SIN registro.
//
// Antes había un segundo coach-mark (el mapa de "los demás") y tres tarjetas de
// texto (`RetoShareExplainSequence`) encadenadas aquí mismo; ambos se retiraron:
// el "qué es Momentu / el viaje entero / el Marcador" se enseña recorriendo el
// viaje de verdad, no leyéndolo. `blocking` se mantiene en los 2 pasos: aunque
// el objetivo sea una tarjeta (no un mapa vivo), sobre el reveal es más robusto
// capturar el toque que dejar que se cuele a algo de debajo.

import { useEffect, useState, type RefObject } from 'react'
import { useReducedMotion } from '../../ui'
import { CoachMark } from './CoachMark'

type Phase = 'posicion' | 'lista'

export interface Props {
  /** Mapa del resultado del reveal (dónde colocaste tu posición vs el
   * objetivo), a resaltar en el 1er paso: el "resultado" que el receptor debe
   * VER, no solo la cifra. */
  resultRef: RefObject<HTMLElement | null>
  /** Lista de la clasificación + tarjeta de puntos (issue #899), a resaltar en
   * el 2º paso: "cómo vais" tras haber visto la posición propia. */
  listRef: RefObject<HTMLElement | null>
  /**
   * "Siguiente" del ÚLTIMO paso: el llamador navega al viaje real y arranca el
   * tour conducido.
   */
  onNext: () => void
  /** "Saltar" (en cualquier paso): directo al Marcador del viaje, sin registro. */
  onSkip: () => void
}

export function RetoShareGuide({ resultRef, listRef, onNext, onSkip }: Props) {
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('posicion')

  // Lleva el objetivo de la fase ACTUAL a la vista: el reveal scrollea y puede
  // quedar fuera de pantalla, y al pasar de fase el objetivo cambia (del mapa a
  // la lista, más abajo en la página). `CoachMark` remide sola cada 400ms, así
  // que el aro encaja aunque el scroll no sea instantáneo (mismo criterio que
  // `GuidedTour`).
  useEffect(() => {
    const targetRef = phase === 'posicion' ? resultRef : listRef
    targetRef.current?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    // Solo al cambiar de fase: refs y reducedMotion se leen tal cual estén en
    // ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (phase === 'posicion') {
    return (
      <CoachMark
        targetRef={resultRef}
        step="Paso 1 de 2 · Tu posición"
        title="Este es tu resultado"
        body="Aquí ves dónde te situaste y lo cerca que quedaste del objetivo. Tus puntos, justo debajo (cuanto más cerca, más puntos)."
        ariaLabel="Este es tu resultado"
        dismissLabel="Saltar"
        primaryAction={{ label: 'Siguiente', onClick: () => setPhase('lista') }}
        onDismiss={onSkip}
        // A prueba de balas (issue #888/#891): sobre el reveal capturamos el toque
        // en vez del pass-through de siempre (el usuario solo lee + pulsa).
        blocking
      />
    )
  }

  return (
    <CoachMark
      targetRef={listRef}
      step="Paso 2 de 2 · La clasificación"
      title="Cómo vais"
      body="La lista de todos y tu puntuación: gana quien más se acerca al objetivo."
      ariaLabel="Cómo vais"
      dismissLabel="Saltar"
      primaryAction={{ label: 'Siguiente', onClick: onNext }}
      onDismiss={onSkip}
      blocking
    />
  )
}
