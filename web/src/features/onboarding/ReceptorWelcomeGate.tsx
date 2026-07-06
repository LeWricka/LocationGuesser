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
import { persistOnboardingSeen } from '../../lib/profile'
import type { ProfileOnboarding } from '../../lib/database.types'
import { OnboardingGate } from './OnboardingGate'
import { useReceptorWelcome } from './useReceptorWelcome'

interface Props {
  groupId: string | undefined
  userId: string | null | undefined
  /** Mapa de tutoriales ya vistos EN LA CUENTA (#717); ver OnboardingGate. */
  profileOnboarding?: ProfileOnboarding | null
  children: ReactNode
}

export function ReceptorWelcomeGate({ groupId, userId, profileOnboarding, children }: Props) {
  const { show, tripName } = useReceptorWelcome(groupId ?? undefined, userId ?? undefined)

  // Para un receptor, la bienvenida HACE de intro del viaje: damos por visto el
  // tutorial genérico `group` para no encadenar dos slideshows ("te invitan" y
  // luego "qué es Momentu"). La parte de cómo jugar (`challenge`) sí se mantiene
  // aparte, porque es accionable y complementa el "por qué". Se persiste igual
  // que cualquier otro "visto" (#717): caché local + intento en el perfil.
  useEffect(() => {
    if (show) void persistOnboardingSeen('group', userId, profileOnboarding)
  }, [show, userId, profileOnboarding])

  // Hasta confirmar que es un receptor (no el dueño), pintamos solo el contenido.
  if (!show) return <>{children}</>

  return (
    <OnboardingGate
      context="welcome"
      userId={userId}
      profileOnboarding={profileOnboarding}
      slideParams={{ tripName }}
      groupId={groupId}
    >
      {children}
    </OnboardingGate>
  )
}
