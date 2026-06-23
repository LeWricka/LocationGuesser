// Deep-link join: al volver del email con sesión (o al abrir un link de grupo ya
// con sesión), si el destino es un grupo `#g=CODE(&c=…)` damos de alta al usuario
// en ese grupo (auto-join idempotente) y lo llevamos DIRECTO al reto/grupo, no a
// una home genérica (cuentas-y-home.md §2 flujos A y C). El alta es silenciosa e
// idempotente: reentrar no duplica ni falla.

import { useCallback, useRef } from 'react'
import { isMember, joinGroup } from '../../lib/membership'
import { parseHash } from '../../lib/route'
import { track } from '../../lib/analytics'

/**
 * Devuelve `joinIfGroup(hash)`: si el hash apunta a un grupo, hace `joinGroup` y
 * navega a ese hash; si no, navega a la home (hash vacío). Idempotente y a prueba
 * de reentradas (no relanza para el mismo destino mientras una llamada está en
 * curso). Errores de join se devuelven al llamante para que decida (toast, etc.).
 */
export function useDeepLinkJoin(userId: string | undefined) {
  // Evita carreras: si ya estamos uniéndonos a un destino, no lo repetimos.
  const inFlight = useRef<string | null>(null)

  const joinIfGroup = useCallback(
    async (hash: string): Promise<void> => {
      const route = parseHash(hash)

      // Sin grupo en el destino → no hay nada que unir; el router decide la home.
      if (!route.group) {
        if (window.location.hash !== '') window.location.hash = ''
        return
      }

      if (!userId) return
      if (inFlight.current === hash) return
      inFlight.current = hash
      try {
        // ¿Ya soy miembro? Lo comprobamos ANTES del upsert para distinguir un
        // alta real (interesa para analítica) de una reentrada idempotente.
        const alreadyMember = await isMember(route.group, userId)
        // Auto-join idempotente: alta en group_members (o no-op si ya soy miembro).
        await joinGroup(route.group, userId)
        // Solo contamos `group_joined` cuando el usuario REALMENTE se une (no en
        // reentradas: abrir el mismo link otra vez no es un join nuevo).
        if (!alreadyMember) {
          track('group_joined', { group_id: route.group })
        }
        // Restaurar el destino: el router por hash repinta a JUGAR (si hay #c) o
        // a la página del grupo. Normalizamos a `#g=…(&c=…)`.
        const normalized = normalizeGroupHash(route.group, route.challenge)
        if (window.location.hash !== normalized) {
          window.location.hash = normalized
        }
      } finally {
        inFlight.current = null
      }
    },
    [userId],
  )

  return joinIfGroup
}

function normalizeGroupHash(group: string, challenge?: string): string {
  const params = new URLSearchParams({ g: group })
  if (challenge) params.set('c', challenge)
  return `#${params.toString()}`
}
