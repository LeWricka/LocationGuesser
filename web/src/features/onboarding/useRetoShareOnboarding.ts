// Detecta y gobierna el onboarding de entrada por RETO COMPARTIDO (onboarding
// nuevo, pieza 2/4): quien abre un enlace de UN reto suelto (deep link
// `#g=…&c=…`, `route.challenge` en App.tsx) SIN cuenta y por PRIMERA vez recibe
// una intro mínima antes de jugar y, tras el resultado, la explicación de
// Momentu + puente al viaje + registro opcional (ver RetoShareIntro/
// RetoShareExplainSequence). PlayChallenge es el único llamante: la detección
// no necesita datos de App.tsx (ni siquiera necesita saber si venía de un
// enlace de reto "puro" o del propio viaje) — con `isAnonymous` + los flags del
// perfil basta, así que no hace falta tocar el router para esto.
//
// Excluye a quien YA pasó por la bienvenida del INVITADO (`welcome`/`group`,
// ver ReceptorWelcomeGate): si entró primero por el enlace del VIAJE entero
// (Diario/Bitácora) ya le explicamos qué es Momentu — repetírselo al abrir un
// reto desde ahí sería la misma idea dos veces. Solo aplica a quien aterriza
// DIRECTO en un reto sin haber visto nunca esa bienvenida.
//
// Detección SÍNCRONA a propósito (a diferencia de `useReceptorWelcome`, que
// resuelve el dueño del viaje de forma asíncrona): no hace falta ninguna
// lectura a Supabase para decidir si aplica, así que no hay riesgo de que la
// respuesta "confirme tarde" encima de una jugada ya empezada — el motivo por
// el que App.tsx evita expresamente `ReceptorWelcomeGate` en la ruta de reto
// (ver su comentario en el router por hash).
//
// "Visto" se marca DESDE que se decide que aplica (no al terminar la
// secuencia entera): mismo criterio que `group` en ReceptorWelcomeGate — un
// recorrido interrumpido a medias (se cierra la pestaña) no debe repetirse.
// También se marcan `welcome`/`group` a la vez: quien ya vivió esta
// explicación no necesita la bienvenida del viaje si más tarde entra por el
// enlace del viaje entero (mismo "porqué", ya contado).

import { useEffect, useState } from 'react'
import { hasSeenOnboarding } from '../../lib/onboardingFlags'
import { persistOnboardingSeen } from '../../lib/profile'
import { track } from '../../lib/analytics'
import type { ProfileOnboarding } from '../../lib/database.types'

export interface RetoShareOnboarding {
  /**
   * ¿Aplica el recorrido completo (intro + explicación) a este visitante?
   * Fijo durante toda la vida del componente que llama al hook: no cambia si
   * el perfil se actualiza a media partida (evita que la intro aparezca y
   * desaparezca sola si `profileOnboarding` llega tarde).
   */
  active: boolean
}

export function useRetoShareOnboarding(
  groupId: string | undefined,
  userId: string | null | undefined,
  isAnonymous: boolean,
  profileOnboarding?: ProfileOnboarding | null,
): RetoShareOnboarding {
  const [active] = useState(
    () =>
      isAnonymous &&
      !!groupId &&
      !hasSeenOnboarding('reto_share', userId, profileOnboarding) &&
      !hasSeenOnboarding('welcome', userId, profileOnboarding) &&
      !hasSeenOnboarding('group', userId, profileOnboarding),
  )

  useEffect(() => {
    if (!active) return
    track('onboarding_started', { context: 'reto_share' })
    void persistOnboardingSeen('reto_share', userId, profileOnboarding)
    void persistOnboardingSeen('welcome', userId, profileOnboarding)
    void persistOnboardingSeen('group', userId, profileOnboarding)
    // Se marca UNA vez, al confirmar que aplica: no debe repetirse si el
    // perfil cambia después (p.ej. al refrescarlo tras otro tutorial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { active }
}
