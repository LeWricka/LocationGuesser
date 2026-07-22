// Guía del RETO COMPARTIDO tras el resultado (onboarding nuevo, pieza 2/4).
//
// Orquesta, SIN taparlo, la explicación de quien juega su primer reto suelto
// como anónimo: PlayChallenge la monta AUTOMÁTICAMENTE la 1ª vez, en cuanto
// se revela el resultado (issue #888 — antes había un botón "¿Qué es esto?"
// que casi nadie pulsaba, paso ciego del funnel). "Sin taparlo" se sostiene
// igual: los dos primeros pasos son coach-marks a prueba de balas (`blocking`
// en `CoachMark`) que SEÑALAN el resultado/mapa reales (siguen visibles,
// atenuados alrededor) en vez de sustituirlos por un overlay opaco.
//
// Dos fases, cada una robusta por sí sola (nada depende de que una ref
// sobreviva a un cambio de ruta):
//   1. Coach-marks BLOQUEANTES sobre elementos REALES del reveal (refs que le
//      pasa PlayChallenge): "tu resultado" (la tarjeta de puntos) y "lo que
//      marcaron los demás" (el mapa con todos los pines, Leaflet vivo — de
//      ahí `blocking`: sin capar el mapa, arrastrarlo se cuela por debajo).
//      Reutiliza `CoachMark`.
//   2. Las tarjetas de `RetoShareExplainSequence` (la sección de retos, el
//      puente al viaje y qué es Momentu) + el registro opcional.
//
// El recorrido NO conduce a través del cambio de ruta hacia el Marcador (eso
// desmontaría PlayChallenge y sus refs): en su lugar, al terminar cae en el
// Marcador (`onFinish` → `marcadorGuideGroupHash`) y allí un coach-mark de
// entrada —consumido de un flag de un solo uso del hash, mismo patrón que
// `tour=1`— señala la clasificación real. Así cada pieza es independiente y
// no hay tour frágil cruzando de la ruta de jugar a la del viaje.

import { useEffect, useState, type RefObject } from 'react'
import { useReducedMotion } from '../../ui'
import { CoachMark } from './CoachMark'
import { RetoShareExplainSequence } from './RetoShareExplainSequence'

type Phase = 'result' | 'others' | 'cards'

export interface Props {
  /** Nombre de quien creó el viaje (protagonista del copy de las tarjetas). */
  ownerName?: string
  /** Tarjeta de puntuación del reveal, a resaltar en el primer coach-mark. */
  resultRef: RefObject<HTMLElement | null>
  /** Mapa con los pines de todos, a resaltar en el segundo coach-mark. */
  othersRef: RefObject<HTMLElement | null>
  /** "Crear cuenta" del registro final: abre el alta real (AccountUpgradeModal). */
  onCreateAccount: () => void
  /**
   * Fin del recorrido (registro cerrado con "Ahora no"): el llamador navega al
   * Marcador con el coach-mark de entrada (`marcadorGuideGroupHash`).
   */
  onFinish: () => void
  /** Fase inicial. Solo la galería de diseño/a11y lo usa para capturar cada fase. */
  initialPhase?: Phase
}

export function RetoShareGuide({
  ownerName,
  resultRef,
  othersRef,
  onCreateAccount,
  onFinish,
  initialPhase = 'result',
}: Props) {
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(initialPhase)
  // Al saltar los coach-marks se entra a las tarjetas directo por el registro
  // (última oportunidad de guardar cuenta); al avanzarlos, por el principio.
  const [cardsStart, setCardsStart] = useState<'retos' | 'registro'>('retos')

  // Lleva el objetivo del coach-mark activo a la vista: el reveal es una página
  // que scrollea, y la tarjeta de puntos o el mapa pueden quedar fuera de
  // pantalla. `CoachMark` remide sola cada 400ms, así que el aro encaja aunque
  // el scroll no sea instantáneo (mismo criterio que `GuidedTour`).
  useEffect(() => {
    if (phase === 'cards') return
    const target = phase === 'result' ? resultRef.current : othersRef.current
    target?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
    // Solo al cambiar de fase de coach-mark: refs y reducedMotion se leen tal
    // cual estén en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (phase === 'result') {
    return (
      <CoachMark
        targetRef={resultRef}
        step="Paso 1 de 2 · Tu resultado"
        title="Esto es tu resultado"
        body="Tus puntos y a qué distancia quedaste del objetivo: cuanto más cerca, más puntos."
        ariaLabel="Esto es tu resultado"
        dismissLabel="Saltar"
        primaryAction={{ label: 'Siguiente', onClick: () => setPhase('others') }}
        onDismiss={() => {
          setCardsStart('registro')
          setPhase('cards')
        }}
        // A prueba de balas (issue #888): el segundo paso ancla al mapa de
        // resultado (Leaflet vivo) — sin `blocking` el pass-through de
        // siempre arrastraba el mapa y "Siguiente" no recibía el toque.
        blocking
      />
    )
  }

  if (phase === 'others') {
    return (
      <CoachMark
        targetRef={othersRef}
        step="Paso 2 de 2 · Tu gente"
        title="Esto marcaron los demás"
        body="Cada pin es la respuesta de alguien de tu gente. Gana quien más se acerca al objetivo."
        ariaLabel="Esto marcaron los demás"
        dismissLabel="Saltar"
        primaryAction={{
          label: 'Siguiente',
          onClick: () => {
            setCardsStart('retos')
            setPhase('cards')
          },
        }}
        onDismiss={() => {
          setCardsStart('registro')
          setPhase('cards')
        }}
        // Mismo motivo que arriba: este paso ancla justo al mapa con los
        // pines de todos.
        blocking
      />
    )
  }

  return (
    <RetoShareExplainSequence
      ownerName={ownerName}
      initialStep={cardsStart}
      onCreateAccount={onCreateAccount}
      onDismiss={onFinish}
    />
  )
}
