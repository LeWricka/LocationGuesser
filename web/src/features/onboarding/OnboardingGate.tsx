// Puerta de onboarding: envuelve una pantalla y, la PRIMERA vez que el usuario
// llega a ese contexto (grupo o reto), muestra el tutorial como overlay encima.
// Engancha la persistencia (useOnboarding) y la analítica (track). App.tsx la usa
// como wrapper sin tocar la lógica de routing ni las pantallas envueltas.
//
// Contexto `welcome` (onboarding nuevo, pieza 1/4): en vez del slideshow de 3
// pasos, pinta el marco de UNA pantalla `GuestWelcomeFrame` — el motor (visto/
// analítica) es EXACTAMENTE el mismo, solo cambia el CONTENIDO que gatea.

import { useEffect, useRef, type ReactNode } from 'react'
import { track } from '../../lib/analytics'
import type { OnboardingContext } from '../../lib/onboardingFlags'
import type { ProfileOnboarding } from '../../lib/database.types'
import { useOnboarding } from './useOnboarding'
import { OnboardingSlideshow } from './OnboardingSlideshow'
import { GuestWelcomeFrame, type Props as GuestWelcomeFrameProps } from './GuestWelcomeFrame'
import { getSlides } from './slides'

interface Props {
  context: OnboardingContext
  /** Id del usuario (de useSession). Sin él, el flag cae a una clave global. */
  userId?: string | null
  /**
   * Mapa de tutoriales ya vistos EN LA CUENTA (`useSession().profile.onboarding`,
   * issue #717). Fuente de la verdad cuando hay sesión: si trae este contexto,
   * el tutorial no se muestra aunque el localStorage de este navegador esté
   * vacío. Ver lib/onboardingFlags.ts para el diagnóstico completo.
   */
  profileOnboarding?: ProfileOnboarding | null
  /**
   * Datos reales del viaje para `GuestWelcomeFrame` (SOLO contexto `welcome`):
   * nombre, quién invita, avatares de quién ya está dentro, portada y si hay un
   * reto en juego. Sin esto, el contexto `welcome` no pinta nada aunque
   * `shouldShow` sea true (evita un marco a medias mientras se resuelve).
   */
  welcomeData?: Omit<GuestWelcomeFrameProps, 'onEnter'>
  /**
   * Id del viaje (solo lo pasa el contexto `welcome` del receptor). Sirve para el
   * evento de embudo `receptor_welcome_shown` (#330); no afecta al render.
   */
  groupId?: string
  /**
   * Se llama al COMPLETAR la intro de bienvenida (solo contexto `welcome`): el
   * receptor pulsó "Ver el viaje" (issue #901). `ReceptorWelcomeGate` lo usa para
   * ARRANCAR el tour de bienvenida en `TripPage`. Separado de `markSeen`:
   * OnboardingGate no sabe de tours, solo avisa de que se entró al viaje.
   */
  onWelcomeEntered?: () => void
  children: ReactNode
}

export function OnboardingGate({
  context,
  userId,
  profileOnboarding,
  welcomeData,
  groupId,
  onWelcomeEntered,
  children,
}: Props) {
  const { shouldShow, markSeen, skip } = useOnboarding(context, userId, profileOnboarding)

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
    // Solo la bienvenida del receptor encadena el tour del viaje (issue #901):
    // avisar tras marcar visto, para que el disparo del tour ocurra una vez la
    // intro ya está resuelta.
    if (context === 'welcome') onWelcomeEntered?.()
  }

  const handleSkip = () => {
    track('onboarding_skipped', { context })
    skip()
  }

  return (
    <>
      {children}
      {shouldShow &&
        (context === 'welcome' ? (
          welcomeData && <GuestWelcomeFrame {...welcomeData} onEnter={handleComplete} />
        ) : (
          <OnboardingSlideshow
            slides={getSlides(context)}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        ))}
    </>
  )
}
