// Carga y compone los datos de la home a partir de la membresía (lib/membership)
// y los mapea a la forma que consume el UI kit (HomeGroup). La home es presentación:
// aquí solo orquestamos helpers de lib/ y traducimos tipos; no hay lógica de datos
// nueva (esa vive en lib/).
//
// Maqueta B "diario visual": un FEED de portadas + el reto abierto FIJADO arriba
// ("Te toca jugar"). Por eso aquí, además de la lista de viajes, resolvemos el reto
// pendiente MÁS URGENTE (pendingChallenges ya viene ordenado por deadline) con su
// foto firmada, para alimentar la tarjeta destacada de la home.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeGroup, HomeGroupMember } from '../../ui'
import { groupAvatars, myGroups, pendingChallenges } from '../../lib/membership'
import type { MemberAvatar, MyGroup } from '../../lib/membership'
import { signedImageUrl } from '../../lib/storage'
import { useVisibilityReload } from '../../lib/useVisibilityReload'

/** Reto abierto más urgente, ya firmado, para la tarjeta fijada "Te toca jugar". */
export interface PinnedChallenge {
  groupId: string
  challengeId: string
  /** Nº TOTAL de retos pendientes de jugar (en todos los viajes): la píldora
   * muestra el más urgente, pero anuncia cuántos esperan ("Te tocan 4 retos"). */
  pendingCount: number
  /** Título del reto (p.ej. "¿Dónde tomé esta foto?"). */
  title: string
  /** Nombre del viaje al que pertenece el reto (subtítulo de la tarjeta). */
  groupName: string | null
  /** Plazo absoluto (ISO) para la cuenta atrás, o null (reto sin plazo). */
  deadlineAt: string | null
  /** Foto del reto firmada, o null (cae a un fondo de papel). */
  coverUrl: string | null
}

interface HomeData {
  groups: HomeGroup[]
  /** Reto fijado arriba, o null si no hay ninguno pendiente que me toque jugar. */
  pinned: PinnedChallenge | null
}

interface State {
  loading: boolean
  error: boolean
  data: HomeData
}

const EMPTY: HomeData = { groups: [], pinned: null }

// El estado de membresía es 'live' | 'your-turn' | 'idle'; el GroupCard del kit
// usa 'live' | 'toplay' | 'idle'. Solo cambia el nombre del caso "te toca".
function toUiStatus(status: MyGroup['status']): HomeGroup['status'] {
  return status === 'your-turn' ? 'toplay' : status
}

// `MemberAvatar` (lib) y `HomeGroupMember` (ui) tienen la misma forma; sin
// conversión salvo el nombre del campo. Mapeo explícito en vez de un cast: dos
// tipos con el mismo shape pero definidos en capas distintas (datos vs. UI) no
// deberían acoplarse por casualidad de estructura.
function toHomeGroupMember(m: MemberAvatar): HomeGroupMember {
  return { userId: m.userId, name: m.name, avatarUrl: m.avatarUrl }
}

function toHomeGroup(group: MyGroup, members: MemberAvatar[]): HomeGroup {
  return {
    id: group.id,
    name: group.name ?? group.id, // sin nombre aún → mostramos el código del grupo
    status: toUiStatus(group.status),
    owned: group.isOwner,
    createdAt: group.createdAt,
    closed: group.closed,
    startsOn: group.startsOn,
    endsOn: group.endsOn,
    // La portada propia del viaje se firma en HomePage (junto a la derivada del
    // mapa, que es el fallback): aquí solo arrastramos el path.
    coverPath: group.coverImagePath,
    // Fila de avatares del grupo (issue #543): ver `groupAvatars` más abajo.
    members: members.map(toHomeGroupMember),
  }
}

/** Firma el path de una foto a URL; null si no hay path o si falla (no rompe la home). */
async function signOrNull(imagePath: string | null | undefined): Promise<string | null> {
  if (!imagePath) return null
  try {
    return await signedImageUrl(imagePath)
  } catch {
    return null
  }
}

/**
 * Resuelve el reto fijado: el pendiente MÁS URGENTE (primero de la lista, que ya
 * viene ordenada por deadline). Firma su foto. Sin pendientes → null (no se fija
 * nada arriba; la home muestra solo el feed).
 */
async function loadPinned(userId: string): Promise<PinnedChallenge | null> {
  const pending = await pendingChallenges(userId)
  const top = pending[0]
  if (!top) return null
  return {
    groupId: top.groupId,
    challengeId: top.challenge.id,
    pendingCount: pending.length,
    title: top.challenge.title,
    groupName: top.groupName,
    deadlineAt: top.challenge.deadline_at,
    coverUrl: await signOrNull(top.challenge.image_path),
  }
}

async function loadHomeData(userId: string): Promise<HomeData> {
  // En paralelo: la lista de viajes y el reto fijado (ambos derivan de la
  // membresía; se resuelven a la vez para no encadenar latencias).
  const [groups, pinned] = await Promise.all([myGroups(userId), loadPinned(userId)])
  // Avatares (issue #543): UNA consulta agregada para TODOS los viajes visibles
  // (no una por tarjeta — evita N+1), encadenada tras `myGroups` porque necesita
  // sus ids. `groupAvatars` ya es, en sí misma, solo dos consultas (membresías +
  // perfiles) para todo el lote.
  const avatarsByGroup = await groupAvatars(groups.map((g) => g.id))
  return {
    groups: groups.map((g) => toHomeGroup(g, avatarsByGroup.get(g.id) ?? [])),
    pinned,
  }
}

/**
 * Hook de datos de la home. Recarga al montar y expone `reload` (lo usa el
 * realtime de HomePage). Mientras carga, `loading=true` para que la pantalla
 * muestre skeletons; ante error, `error=true` y un aviso (sin romper la app).
 */
export function useHomeData(userId: string | undefined) {
  const [state, setState] = useState<State>({ loading: true, error: false, data: EMPTY })
  // Cuándo se resolvió la última carga (issue #638): NO en el render, sino en un
  // ref — así `useVisibilityReload` lo lee sin que este hook tenga que reengancharse.
  const lastResolvedAtRef = useRef<number | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setState({ loading: false, error: false, data: EMPTY })
      return
    }
    try {
      const data = await loadHomeData(userId)
      lastResolvedAtRef.current = Date.now()
      setState({ loading: false, error: false, data })
    } catch {
      setState({ loading: false, error: true, data: EMPTY })
    }
  }, [userId])

  useEffect(() => {
    // reload es async: el setState corre tras los fetch, no síncrono en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async, no síncrona
    void reload()
  }, [reload])

  // Re-firma defensiva (issue #638): si la pestaña vuelve tras estar de fondo más
  // de STALE_RELOAD_MS, las URLs firmadas de portadas/pines pueden haber caducado
  // (TTL 24h, pero una PWA puede quedar viva más) — recargamos por delante en vez
  // de esperar a que el usuario vea la home en blanco.
  useVisibilityReload(
    () => lastResolvedAtRef.current,
    () => void reload(),
  )

  return { ...state, reload }
}
