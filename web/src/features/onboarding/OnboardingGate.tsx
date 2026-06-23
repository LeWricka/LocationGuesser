// Puerta de onboarding: envuelve una pantalla y, la PRIMERA vez que el usuario
// llega a ese contexto (grupo o reto), muestra el tutorial como overlay encima.
// Engancha la persistencia (useOnboarding) y la analítica (track). App.tsx la usa
// como wrapper sin tocar la lógica de routing ni las pantallas envueltas.

import { useEffect, useRef, type ReactNode } from 'react'
import { track } from '../../lib/analytics'
import type { OnboardingContext } from '../../lib/onboardingFlags'
import { useOnboarding } from './useOnboarding'
import { OnboardingSlideshow } from './OnboardingSlideshow'
import { getSlides } from './slides'

interface Props {
  context: OnboardingContext
  /** Id del usuario (de useSession). Sin él, el flag cae a una clave global. */
  userId?: string | null
  children: ReactNode
}

export function OnboardingGate({ context, userId, children }: Props) {
  const { shouldShow, markSeen, skip } = useOnboarding(context, userId)

  // Emite onboarding_started una sola vez al abrirse el tutorial (no en cada
  // render mientras está visible).
  const startedRef = useRef(false)
  useEffect(() => {
    if (shouldShow && !startedRef.current) {
      startedRef.current = true
      track('onboarding_started', { context })
    }
  }, [shouldShow, context])

  const handleComplete = () => {
    track('onboarding_completed', { context })
    markSeen()
  }

  const handleSkip = () => {
    track('onboarding_skipped', { context })
    skip()
  }

  return (
    <>
      {children}
      {shouldShow && (
        <OnboardingSlideshow
          slides={getSlides(context)}
          onComplete={handleComplete}
          onSkip={handleSkip}
        />
      )}
    </>
  )
}
