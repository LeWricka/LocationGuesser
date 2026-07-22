// Gobierna el registro post-valor del invitado (onboarding nuevo, pieza 1/4):
// el receptor anónimo del enlace ve `GuestRegisterPrompt` la primera vez que
// VUELVE al viaje tras haber jugado al menos un reto — nunca antes de jugar.
// Reutiliza el mismo motor de "visto" que el resto del onboarding
// (`useOnboarding`, contexto `guest-register`) y la misma fuente de "¿jugó
// algo?" que ya alimenta el marcador (`getGroupVotes`), sin tocar la pantalla
// de jugar ni duplicar esa consulta.

import { useEffect, useState } from 'react'
import { getGroupVotes } from '../../lib/leaderboard'
import type { ProfileOnboarding } from '../../lib/database.types'
import { EXAMPLE_TRIP_GROUP_ID } from '../../lib/exampleTrip'
import { useOnboarding } from './useOnboarding'

export interface UseGuestRegisterPrompt {
  /** ¿Mostrar el registro post-valor ahora? */
  show: boolean
  /** Lo marca como visto (no vuelve a aparecer para este usuario). */
  markSeen: () => void
}

export function useGuestRegisterPrompt(
  groupId: string | undefined,
  userId: string | undefined,
  isAnonymous: boolean,
  profileOnboarding?: ProfileOnboarding | null,
): UseGuestRegisterPrompt {
  const { shouldShow, markSeen } = useOnboarding('guest-register', userId, profileOnboarding)
  const [hasPlayed, setHasPlayed] = useState(false)

  useEffect(() => {
    let active = true

    void (async () => {
      // Solo merece la pena mirar votos si, por lo demás, tocaría mostrarlo: un
      // registrado o quien ya lo vio no necesita esta consulta. El viaje de
      // EJEMPLO (id centinela, onboarding nuevo pieza 4/4) tampoco: es solo
      // lectura, sin votos reales que consultar — cortamos antes de la red.
      if (!groupId || !userId || !isAnonymous || !shouldShow || groupId === EXAMPLE_TRIP_GROUP_ID) {
        if (active) setHasPlayed(false)
        return
      }
      try {
        const votes = await getGroupVotes(groupId)
        if (active) setHasPlayed(votes.some((v) => v.user_id === userId))
      } catch {
        // Sin dato, no arriesgamos a interrumpir con un registro que no toca.
        if (active) setHasPlayed(false)
      }
    })()

    return () => {
      active = false
    }
  }, [groupId, userId, isAnonymous, shouldShow])

  return { show: isAnonymous && shouldShow && hasPlayed, markSeen }
}
