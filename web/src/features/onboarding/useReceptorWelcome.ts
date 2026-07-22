// Bienvenida del RECEPTOR (lo clave del onboarding): cuando alguien llega por un
// enlace compartido (`/v/`, `/j/` o `#g=` — ver lib/cleanRoute y el router por
// hash de App) y es su PRIMERA vez, le mostramos un marco a medida (una sola
// pantalla, ver GuestWelcomeFrame) con el nombre del viaje, quién le invitó y
// quién más ya está dentro.
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
import { getGroup, getGroupChallenges, isLive } from '../../lib/groupData'
import { groupAvatars, type MemberAvatar } from '../../lib/membership'
import { signedImageUrl } from '../../lib/storage'
import { EXAMPLE_TRIP_GROUP_ID } from '../../lib/exampleTrip'
import { prizesLine } from '../group/prizes'

interface ReceptorWelcome {
  /** ¿Mostrar el marco de bienvenida del receptor para este grupo? */
  show: boolean
  /** Nombre del viaje para el eyebrow/título (o undefined → copy genérico). */
  tripName?: string
  /** Resumen de premios "en juego" (issue #752), o undefined si el dueño no
   * definió ninguno. Se conserva para cuando el marco quiera mostrarlo. */
  prizesSummary?: string
  /** Nombre de quien creó el viaje: protagonista del saludo ("...viaje de X"). */
  ownerName?: string
  /** Miembros YA dentro del viaje, sin contar al dueño ni a quien ve este marco
   * ("X y N más ya están dentro"). */
  othersCount: number
  /** Avatares reales de los miembros (dueño incluido, el propio receptor no) para
   * la fila de avatares del marco (`AvatarStack`). Vacío si falla o no hay. */
  avatarMembers: MemberAvatar[]
  /** Portada del viaje ya firmada, para el fondo del marco. Null sin portada. */
  coverImageUrl: string | null
  /** ¿Hay al menos un reto EN JUEGO ahora mismo? Gobierna el aviso "te toca un
   * reto" del marco — sin esto, el turno se anunciaría aunque no haya nada que
   * jugar todavía. */
  hasActiveChallenge: boolean
}

const EMPTY_DATA: Omit<ReceptorWelcome, 'show'> = {
  othersCount: 0,
  avatarMembers: [],
  coverImageUrl: null,
  hasActiveChallenge: false,
}

const EMPTY_STATE: ReceptorWelcome = { show: false, ...EMPTY_DATA }

export function useReceptorWelcome(
  groupId: string | undefined,
  userId: string | undefined,
): ReceptorWelcome {
  const [state, setState] = useState<ReceptorWelcome>(EMPTY_STATE)

  useEffect(() => {
    let active = true

    void (async () => {
      // Sin grupo o sin usuario aún no hay receptor que saludar.
      if (!groupId || !userId) {
        if (active) setState(EMPTY_STATE)
        return
      }
      // Viaje de EJEMPLO (onboarding nuevo, pieza 4/4): id CENTINELA — nunca hay
      // un "dueño" real que saludar como receptor (es solo lectura, para
      // cualquiera). Cortamos ANTES de `isOwner`/`resolveGuestData`: sin este
      // guarda, cada visita disparaba dos consultas a `groups` más el resto de
      // `resolveGuestData` (getGroup/getGroupChallenges/groupAvatars) contra un
      // groupId que no existe — inofensivo (resuelven vacío/null), pero rompe la
      // promesa de "viaje de ejemplo 100% offline, sin ni una petición".
      if (groupId === EXAMPLE_TRIP_GROUP_ID) {
        if (active) setState(EMPTY_STATE)
        return
      }
      // ¿Soy el dueño del viaje? El creador no es un receptor; nunca le saludamos.
      // Guarda de SEGURIDAD (no cosmética): ante cualquier duda (RLS, red) cae a
      // "sí es dueño" y NO se muestra — nunca al revés.
      const owner = await isOwner(groupId, userId)
      if (!active) return
      if (owner) {
        setState(EMPTY_STATE)
        return
      }
      // Datos del viaje para el marco (best-effort, cosmético): nombre, premios,
      // quién invita, avatares de quien ya está dentro, portada y si hay reto en
      // juego. Un fallo aquí nunca oculta el marco (ya sabemos que no es el
      // dueño) — como mucho degrada a copy genérico.
      const data = await resolveGuestData(groupId, userId)
      if (!active) return
      setState({ show: true, ...data })
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

async function resolveGuestData(
  groupId: string,
  viewerId: string,
): Promise<Omit<ReceptorWelcome, 'show'>> {
  try {
    const [group, ownerId, avatarsByGroup, challenges] = await Promise.all([
      getGroup(groupId),
      ownerIdOf(groupId),
      groupAvatars([groupId]),
      getGroupChallenges(groupId),
    ])
    const members = avatarsByGroup.get(groupId) ?? []
    const owner = ownerId ? members.find((m) => m.userId === ownerId) : undefined
    // "Ya están dentro" es cualquier miembro salvo el propio receptor y el dueño
    // (el dueño ya se nombra aparte en el titular, "viaje de {ownerName}").
    const others = members.filter((m) => m.userId !== viewerId && m.userId !== ownerId)
    const coverImageUrl = group?.cover_image_path
      ? await signedImageUrl(group.cover_image_path)
      : null
    const now = new Date()
    const hasActiveChallenge = challenges.some((c) => c.is_challenge && isLive(c, now))
    return {
      tripName: group?.name ?? undefined,
      prizesSummary: prizesLine(group?.prizes ?? null) ?? undefined,
      ownerName: owner?.name,
      othersCount: others.length,
      // Fila de avatares del marco: cualquier miembro salvo el propio receptor
      // (dueño incluido — es "gente ya dentro" igual que el resto).
      avatarMembers: members.filter((m) => m.userId !== viewerId),
      coverImageUrl,
      hasActiveChallenge,
    }
  } catch {
    return EMPTY_DATA
  }
}

// `created_by` del grupo, para poner NOMBRE al dueño en el titular ("viaje de
// X"). Puramente cosmético (a diferencia de `isOwner`, que gobierna si se
// muestra el marco): si falla, `ownerName` queda undefined y el titular cae al
// genérico "Estás dentro de este viaje" — nunca oculta el marco.
async function ownerIdOf(groupId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .maybeSingle<{ created_by: string | null }>()
    return data?.created_by ?? null
  } catch {
    return null
  }
}
