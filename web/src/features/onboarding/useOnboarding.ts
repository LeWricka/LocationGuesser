// Hook que decide si mostrar un tutorial de onboarding y persiste el "ya visto".
// La regla de negocio: cada tutorial se ve UNA sola vez por usuario. Desde el
// arreglo de raíz (#717), la fuente de la verdad es el mapa `profiles.onboarding`
// de la sesión logueada (lo pasa el llamante, ver App.tsx → useSession().profile);
// localStorage (lib/onboardingFlags) queda como caché rápida anti-parpadeo y como
// única fuente para el receptor anónimo pre-login (sin userId).

import { useCallback, useState } from 'react'
import { hasSeenOnboarding, type OnboardingContext } from '../../lib/onboardingFlags'
import { persistOnboardingSeen } from '../../lib/profile'
import type { ProfileOnboarding } from '../../lib/database.types'

export interface UseOnboarding {
  /** ¿Debe mostrarse el tutorial ahora? (no visto todavía). */
  shouldShow: boolean
  /** Lo marca como visto (al completarlo). Oculta el tutorial. */
  markSeen: () => void
  /** Saltar: igual que markSeen pero semánticamente "el usuario lo cerró". */
  skip: () => void
}

export function useOnboarding(
  context: OnboardingContext,
  userId?: string | null,
  profileOnboarding?: ProfileOnboarding | null,
): UseOnboarding {
  // Estado inicial = ¿no lo ha visto? Lo leemos una vez con el lazy initializer
  // para no tocar localStorage/perfil en cada render. Cambia solo cuando el
  // usuario cierra/completa el tutorial.
  const [shouldShow, setShouldShow] = useState(
    () => !hasSeenOnboarding(context, userId, profileOnboarding),
  )

  const close = useCallback(() => {
    setShouldShow(false)
    // Fire-and-forget: la UI ya se cierra con el estado local; la persistencia
    // en servidor (best-effort, ver profile.ts) no debe bloquear el cierre.
    void persistOnboardingSeen(context, userId, profileOnboarding)
  }, [context, userId, profileOnboarding])

  return { shouldShow, markSeen: close, skip: close }
}
