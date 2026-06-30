// Puerta de la bienvenida del RECEPTOR. Envuelve la pantalla del viaje/reto y, la
// PRIMERA vez que un invitado llega por un enlace compartido, le muestra encima la
// bienvenida a medida (con el nombre del viaje) que explica el valor y le guía a
// unirse/jugar. Una sola vez por usuario (flag `welcome` de useOnboarding).
//
// Por qué un gate aparte y no reutilizar OnboardingGate "a pelo": decidir si es un
// receptor (y no el dueño) es ASÍNCRONO (useReceptorWelcome). Solo montamos el
// slideshow cuando la resolución confirma que toca; así el creador del viaje nunca
// ve un "te invitan" y no parpadea un tutorial mientras resolvemos.

import { useEffect, type ReactNode } from 'react'
import { markOnboardingSeen } from '../../lib/onboardingFlags'
import { OnboardingGate } from './OnboardingGate'
import { useReceptorWelcome } from './useReceptorWelcome'

interface Props {
  groupId: string | undefined
  userId: string | null | undefined
  children: ReactNode
}

export function ReceptorWelcomeGate({ groupId, userId, children }: Props) {
  const { show, tripName } = useReceptorWelcome(groupId ?? undefined, userId ?? undefined)

  // Para un receptor, la bienvenida HACE de intro del viaje: damos por visto el
  // tutorial genérico `group` para no encadenar dos slideshows ("te invitan" y
  // luego "qué es Lugares"). La parte de cómo jugar (`challenge`) sí se mantiene
  // aparte, porque es accionable y complementa el "por qué".
  useEffect(() => {
    if (show) markOnboardingSeen('group', userId)
  }, [show, userId])

  // Hasta confirmar que es un receptor (no el dueño), pintamos solo el contenido.
  if (!show) return <>{children}</>

  return (
    <OnboardingGate context="welcome" userId={userId} slideParams={{ tripName }}>
      {children}
    </OnboardingGate>
  )
}
