// Hook que decide si mostrar un tutorial de onboarding y persiste el "ya visto".
// La regla de negocio: cada tutorial se ve UNA sola vez por usuario (clave en
// localStorage, ver lib/onboardingFlags). La identidad la pasa el llamante
// (App.tsx) desde useSession(); sin sesión cae a la clave global anónima.

import { useCallback, useState } from 'react'
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  type OnboardingContext,
} from '../../lib/onboardingFlags'

export interface UseOnboarding {
  /** ¿Debe mostrarse el tutorial ahora? (no visto todavía). */
  shouldShow: boolean
  /** Lo marca como visto (al completarlo). Oculta el tutorial. */
  markSeen: () => void
  /** Saltar: igual que markSeen pero semánticamente "el usuario lo cerró". */
  skip: () => void
}

export function useOnboarding(context: OnboardingContext, userId?: string | null): UseOnboarding {
  // Estado inicial = ¿no lo ha visto? Lo leemos una vez con el lazy initializer
  // para no tocar localStorage en cada render. Cambia solo cuando el usuario
  // cierra/completa el tutorial.
  const [shouldShow, setShouldShow] = useState(() => !hasSeenOnboarding(context, userId))

  const close = useCallback(() => {
    markOnboardingSeen(context, userId)
    setShouldShow(false)
  }, [context, userId])

  return { shouldShow, markSeen: close, skip: close }
}
