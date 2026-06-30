// Bienvenida del RECEPTOR (lo clave del onboarding): cuando alguien llega por un
// enlace compartido (`/v/`, `/j/` o `#g=` — ver lib/cleanRoute y el router por
// hash de App) y es su PRIMERA vez, le mostramos una bienvenida a medida con el
// nombre del viaje que explica el valor y le guía a unirse/jugar.
//
// Cuándo SÍ mostrarla:
//  - hay un grupo en la ruta (llegó por un enlace de viaje/reto), y
//  - no la ha visto antes (flag global `welcome`, persistido en useOnboarding), y
//  - NO es el dueño del viaje (el creador acaba de montarlo: no "le invitan").
//
// El "no es dueño" se resuelve leyendo `created_by` del grupo. Es una lectura
// barata y a prueba de carreras con el auto-join (que escribe group_members, no
// groups). Si no podemos resolverlo (RLS, red), caemos a NO mostrar para no
// arriesgarnos a saludar al propio creador.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getGroup } from '../../lib/groupData'

interface ReceptorWelcome {
  /** ¿Mostrar la bienvenida del receptor para este grupo? */
  show: boolean
  /** Nombre del viaje para personalizar el saludo (o undefined → copy genérico). */
  tripName?: string
}

export function useReceptorWelcome(
  groupId: string | undefined,
  userId: string | undefined,
): ReceptorWelcome {
  const [state, setState] = useState<ReceptorWelcome>({ show: false })

  useEffect(() => {
    let active = true

    void (async () => {
      // Sin grupo o sin usuario aún no hay receptor que saludar.
      if (!groupId || !userId) {
        if (active) setState({ show: false })
        return
      }
      // ¿Soy el dueño del viaje? El creador no es un receptor; nunca le saludamos.
      const owner = await isOwner(groupId, userId)
      if (!active) return
      if (owner) {
        setState({ show: false })
        return
      }
      // Nombre del viaje para personalizar el saludo (best-effort).
      const name = await resolveTripName(groupId)
      if (!active) return
      setState({ show: true, tripName: name })
    })()

    return () => {
      active = false
    }
  }, [groupId, userId])

  return state
}

// ¿Es `userId` el creador del grupo? Lectura mínima de `groups.created_by`.
async function isOwner(groupId: string, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .maybeSingle<{ created_by: string | null }>()
    return data?.created_by === userId
  } catch {
    // Ante la duda, tratamos como dueño (no mostramos) para no saludar al creador.
    return true
  }
}

async function resolveTripName(groupId: string): Promise<string | undefined> {
  try {
    const group = await getGroup(groupId)
    return group?.name ?? undefined
  } catch {
    return undefined
  }
}
