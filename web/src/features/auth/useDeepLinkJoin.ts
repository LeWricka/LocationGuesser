// Deep-link join: al volver del email con sesión (o al abrir un link de grupo ya
// con sesión), si el destino es un grupo `#g=CODE(&c=…)` damos de alta al usuario
// en ese grupo (auto-join idempotente) y lo llevamos DIRECTO al reto/grupo, no a
// una home genérica (cuentas-y-home.md §2 flujos A y C). El alta es silenciosa e
// idempotente: reentrar no duplica ni falla.

import { useCallback, useRef, useState } from 'react'
import { isMember, joinGroup } from '../../lib/membership'
import { parseHash, stripOwnerInviteToken } from '../../lib/route'
import { track } from '../../lib/analytics'
import { redeemOwnerInvite } from '../../lib/ownerInvites'
import { ResourceGoneError, describeError } from '../../lib/errors'
import { addBreadcrumb, reportError } from '../../lib/observability'
import { useToast } from '../../ui'

/**
 * Devuelve `joinIfGroup(hash)`: si el hash apunta a un grupo, hace `joinGroup` y
 * navega a ese hash; si no, navega a la home (hash vacío). Idempotente y a prueba
 * de reentradas (no relanza para el mismo destino mientras una llamada está en
 * curso).
 *
 * `isAnonymous` (issue #751) solo alimenta la prop `is_anonymous` de
 * `group_joined`: sin ella no se distingue un alta de miembro con cuenta
 * permanente de un receptor sin cuenta (#758) que se une al abrir el enlace.
 *
 * `error` (QW2): antes, CUALQUIER fallo del join (FK violada, red, RLS…) sacaba
 * al usuario a la home en silencio — un "golpe" tras haber tocado un enlace que
 * parecía prometer un viaje. Ahora el hook se queda en la ruta y expone el
 * mensaje (vía `describeError`) para que el llamante lo pinte inline con una
 * salida EXPLÍCITA ("Ir al inicio"), en vez de decidir por el usuario.
 */
export function useDeepLinkJoin(userId: string | undefined, isAnonymous = false) {
  // Evita carreras: si ya estamos uniéndonos a un destino, no lo repetimos.
  const inFlight = useRef<string | null>(null)
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  const joinIfGroup = useCallback(
    async (hash: string): Promise<void> => {
      const route = parseHash(hash)

      // Sin grupo en el destino → no hay nada que unir; el router decide la home.
      // (No es un error: es la navegación normal cuando el destino guardado no
      // era de grupo, así que sí conviene ir a la home aquí.)
      if (!route.group) {
        if (window.location.hash !== '') window.location.hash = ''
        return
      }

      if (!userId) return
      if (inFlight.current === hash) return
      inFlight.current = hash
      setError(null) // reintento (o navegación nueva): limpiamos el error previo
      try {
        // Enlace de CO-DUEÑO (`#g=…&adm=<token>`, issue #707): en vez del alta
        // normal de miembro, canjeamos el token — asciende directo a co-dueño.
        // Éxito → ya quedó con la membresía correcta, sin pasar por joinGroup
        // (que además sería redundante). Fallo (caducado/usado/inválido) → aviso
        // honesto y CAE al alta normal de miembro, como si `adm` no existiera:
        // quien recibe el enlace nunca se queda sin poder entrar al viaje.
        let ownerInviteFailed = false
        if (route.ownerInviteToken) {
          try {
            await redeemOwnerInvite(route.ownerInviteToken)
            track('owner_invite_redeemed', { group_id: route.group })
          } catch (err) {
            ownerInviteFailed = true
            const detail = err instanceof Error ? err.message : 'inténtalo con el enlace normal'
            toast.show(`No se pudo activar el enlace de co-dueño: ${detail}`, { tone: 'danger' })
          }
        }

        if (!route.ownerInviteToken || ownerInviteFailed) {
          // ¿Ya soy miembro? Lo comprobamos ANTES del upsert para distinguir un
          // alta real (interesa para analítica) de una reentrada idempotente.
          const alreadyMember = await isMember(route.group, userId)
          // Auto-join idempotente: alta en group_members (o no-op si ya soy miembro).
          await joinGroup(route.group, userId)
          // Solo contamos `group_joined` cuando el usuario REALMENTE se une (no en
          // reentradas: abrir el mismo link otra vez no es un join nuevo).
          if (!alreadyMember) {
            track('group_joined', { group_id: route.group, is_anonymous: isAnonymous })
          }
        }
        // Restaurar el destino: el router por hash repinta la pantalla correcta a
        // partir del hash de ENTRADA tal cual, SIN reconstruirlo. `hash` ya viene
        // completo desde los dos únicos llamantes (App.tsx): o es literalmente
        // `window.location.hash` (Flujo C, auto-join al abrir/recargar un `#g=…`
        // con sesión), o es el destino que guardamos en `localStorage` con ese
        // mismo `window.location.hash` antes de salir al email (Flujo A/B,
        // `setNextDestination`/`takeNextDestination`). En ambos casos ya tiene el
        // formato final; no hace falta — ni conviene — reconstruirlo.
        //
        // Antes reconstruíamos con `#g=…(&c=…)` a partir de `route.group` y
        // `route.challenge` (los dos únicos campos que este hook necesita para el
        // join), lo que DESCARTABA en silencio cualquier otro parámetro reconocido
        // del hash (`add=reto`/`add=recuerdo`, `v=marcador`, `from=…`, ver
        // route.ts). En el Flujo C eso reescribía sobre sí mismo el hash actual
        // quitándole esos parámetros en CADA remontaje del efecto (cualquier F5,
        // recarga del Service Worker o volver de segundo plano estando en
        // `#g=X&add=reto`), tirando al usuario a la home del viaje y perdiendo el
        // formulario a medias (#556). Usar `hash` tal cual preserva siempre lo que
        // ya estaba, y comparar contra `window.location.hash` evita además
        // reescrituras innecesarias: en el Flujo C ambos son el mismo string, así
        // que este `if` nunca dispara.
        // `adm` se CONSUME (issue #707): es de un solo uso, así que no debe
        // sobrevivir en la URL tras intentar el canje (con éxito o fallback) —
        // un F5 no debe reintentar el mismo token. Mismo criterio que `add=1`.
        const target = stripOwnerInviteToken(hash)
        if (window.location.hash !== target) {
          window.location.hash = target
        }
      } catch (err) {
        // Antes esto NO se capturaba: un fallo aquí (p.ej. la FK de group_members
        // violada) viajaba como unhandled rejection (issue #760, LOCATIONGUESSER-5,
        // 4 usuarios / 22 eventos), y el manejo posterior mandaba SIEMPRE a la
        // home (hash vacío) — un "golpe" tras haber tocado un enlace que
        // prometía un viaje (QW2). Ahora nos quedamos en la ruta: exponemos el
        // mensaje y es la UI la que ofrece la salida explícita ("Ir al inicio"),
        // no una redirección forzada.
        if (err instanceof ResourceGoneError) {
          // Esperable: el viaje se borró entre que se compartió el enlace y que
          // se abrió. Breadcrumb, NO excepción — no es un fallo real de la app.
          addBreadcrumb('group_gone_on_join', { groupId: route.group })
          setError(err.message)
        } else {
          reportError(err, { area: 'deep_link_join', groupId: route.group })
          setError(describeError(err))
        }
      } finally {
        inFlight.current = null
      }
    },
    [userId, isAnonymous, toast],
  )

  return { joinIfGroup, error, clearError: () => setError(null) }
}
