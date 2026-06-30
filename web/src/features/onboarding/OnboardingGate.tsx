// Puerta de onboarding: envuelve una pantalla y, la PRIMERA vez que el usuario
// llega a ese contexto (grupo o reto), muestra el tutorial como overlay encima.
// Engancha la persistencia (useOnboarding) y la analítica (track). App.tsx la usa
// como wrapper sin tocar la lógica de routing ni las pantallas envueltas.

import { useEffect, useRef, type ReactNode } from 'react'
import { track } from '../../lib/analytics'
import type { OnboardingContext } from '../../lib/onboardingFlags'
import { useOnboarding } from './useOnboarding'
import { OnboardingSlideshow } from './OnboardingSlideshow'
import { getSlides, type SlideParams } from './slides'

interface Props {
  context: OnboardingContext
  /** Id del usuario (de useSession). Sin él, el flag cae a una clave global. */
  userId?: string | null
  /** Datos para personalizar las slides (p.ej. el nombre del viaje en el welcome). */
  slideParams?: SlideParams
  /**
   * Id del viaje (solo lo pasa el contexto `welcome` del receptor). Sirve para el
   * evento de embudo `receptor_welcome_shown` (#330); no afecta al render.
   */
  groupId?: string
  children: ReactNode
}

export function OnboardingGate({ context, userId, slideParams, groupId, children }: Props) {
  const { shouldShow, markSeen, skip } = useOnboarding(context, userId)

  // Emite onboarding_started una sola vez al abrirse el tutorial (no en cada
  // render mientras está visible). En el contexto `welcome` (bienvenida del
  // receptor) emitimos además `receptor_welcome_shown` (#330): cierra el embudo
  // del receptor (aterrizó por un enlace → se le saludó). Aquí es donde el
  // slideshow REALMENTE se muestra (flag no visto), así que no sobrecuenta.
  const startedRef = useRef(false)
  useEffect(() => {
    if (shouldShow && !startedRef.current) {
      startedRef.current = true
      track('onboarding_started', { context })
      if (context === 'welcome') {
        track('receptor_welcome_shown', { group_id: groupId })
      }
    }
  }, [shouldShow, context, groupId])

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
          slides={getSlides(context, slideParams)}
          onComplete={handleComplete}
          onSkip={handleSkip}
        />
      )}
    </>
  )
}
