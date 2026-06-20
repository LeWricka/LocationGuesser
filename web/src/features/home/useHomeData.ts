// Carga y compone los datos de la home a partir de la membresía (lib/membership)
// y los mapea a las formas que consume el UI kit (HomeGroup/HomeTurn/HomeStats).
// La home es presentación: aquí solo orquestamos helpers de lib/ y traducimos
// tipos; no hay lógica de datos nueva (esa vive en lib/).

import { useCallback, useEffect, useState } from 'react'
import type { HomeGroup, HomeStats, HomeTurn } from '../../ui'
import { myGroups, pendingChallenges } from '../../lib/membership'
import type { MyGroup, PendingChallenge } from '../../lib/membership'
import { getGroupVotes } from '../../lib/leaderboard'
import { supabase } from '../../lib/supabase'
import { formatCountdown } from './countdown'

interface HomeData {
  groups: HomeGroup[]
  turns: HomeTurn[]
  stats: HomeStats | null
  /** challengeId → groupId, para construir el deep link #g=<grupo>&c=<reto> al
   * jugar un turno (el callback onPlayTurn solo recibe el challengeId). */
  groupIdByTurn: Map<string, string>
}

interface State {
  loading: boolean
  error: boolean
  data: HomeData
}

const EMPTY: HomeData = { groups: [], turns: [], stats: null, groupIdByTurn: new Map() }

// El estado de membresía es 'live' | 'your-turn' | 'idle'; el GroupCard del kit
// usa 'live' | 'toplay' | 'idle'. Solo cambia el nombre del caso "te toca".
function toUiStatus(status: MyGroup['status']): HomeGroup['status'] {
  return status === 'your-turn' ? 'toplay' : status
}

function toHomeGroup(group: MyGroup): HomeGroup {
  return {
    id: group.id,
    name: group.name ?? group.id, // sin nombre aún → mostramos el código del grupo
    status: toUiStatus(group.status),
    owned: group.isOwner,
  }
}

/**
 * Resuelve los display_name de los creadores de los retos pendientes (su
 * `created_by` es un uuid). Una sola consulta a profiles por todos los autores
 * distintos; si falta alguno, cae a "alguien" para no romper la tarjeta.
 */
async function resolveAuthors(pending: PendingChallenge[]): Promise<Map<string, string>> {
  const ids = [...new Set(pending.map((p) => p.challenge.created_by))]
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((p) => [p.id, p.display_name]))
}

function toHomeTurn(pending: PendingChallenge, authors: Map<string, string>): HomeTurn {
  return {
    id: pending.challenge.id,
    groupName: pending.groupName ?? pending.groupId,
    author: authors.get(pending.challenge.created_by) ?? 'alguien',
    countdown: formatCountdown(pending.challenge.deadline_at),
  }
}

/**
 * "Tus números" v1 (cuentas-y-home.md §3.1/§3.4): agregado mínimo del usuario
 * sobre sus grupos —puntos totales, nº de grupos jugados y mejor reto—. El
 * ranking fino es la pieza #6; aquí basta sumar los votos del usuario en sus
 * grupos. Si no hay puntos, devolvemos null y el dashboard muestra el mensaje
 * guía. Calcularlo es barato porque reutiliza getGroupVotes (ya cacheado por
 * grupo en el camino del leaderboard).
 */
async function computeStats(userId: string, groups: MyGroup[]): Promise<HomeStats | null> {
  if (groups.length === 0) return null

  const votesByGroup = await Promise.all(
    groups.map(async (g) => ({ group: g, votes: await getGroupVotes(g.id) })),
  )

  let totalPoints = 0
  const groupsPlayed = new Set<string>()
  let best: { points: number; groupName: string } | null = null

  for (const { group, votes } of votesByGroup) {
    for (const vote of votes) {
      if (vote.user_id !== userId) continue
      totalPoints += vote.points
      groupsPlayed.add(group.id)
      if (!best || vote.points > best.points) {
        best = { points: vote.points, groupName: group.name ?? group.id }
      }
    }
  }

  if (groupsPlayed.size === 0) return null

  return {
    totalPoints,
    groupsPlayed: groupsPlayed.size,
    best: best ? `${best.points.toLocaleString('es-ES')} (${best.groupName})` : undefined,
  }
}

async function loadHomeData(userId: string): Promise<HomeData> {
  const [groups, pending] = await Promise.all([myGroups(userId), pendingChallenges(userId)])
  const authors = await resolveAuthors(pending)
  const stats = await computeStats(userId, groups)
  return {
    groups: groups.map(toHomeGroup),
    turns: pending.map((p) => toHomeTurn(p, authors)),
    stats,
    groupIdByTurn: new Map(pending.map((p) => [p.challenge.id, p.groupId])),
  }
}

/**
 * Hook de datos de la home. Recarga al montar y expone `reload` (lo usa el
 * realtime de HomePage). Mientras carga, `loading=true` para que la pantalla
 * muestre skeletons; ante error, `error=true` y un aviso (sin romper la app).
 */
export function useHomeData(userId: string | undefined) {
  const [state, setState] = useState<State>({ loading: true, error: false, data: EMPTY })

  const reload = useCallback(async () => {
    if (!userId) {
      setState({ loading: false, error: false, data: EMPTY })
      return
    }
    try {
      const data = await loadHomeData(userId)
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

  return { ...state, reload }
}
