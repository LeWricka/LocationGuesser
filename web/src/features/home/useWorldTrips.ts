// Datos del MAPAMUNDI de la home (fase "nuevo enfoque"): una coordenada
// representativa por viaje (grupo) para clavar un pin-foto en el globo satélite.
// Es PRESENTACIÓN derivada: aquí solo orquestamos helpers de lib/ (getGroupChallenges,
// getAnswers, splitByStatus, signedImageUrl) y los traducimos a la forma que consume
// el mapa de viaje (RoutePoint). No hay lógica de datos nueva (vive en lib/).
//
// REGLA: tolerante a fallo y barato. Resolver la coord de TODOS los viajes a la vez
// puede fallar por grupo (RLS, sin retos cerrados, red); cada viaje se resuelve por
// separado con Promise.allSettled, y un viaje que no aporte coordenada simplemente no
// pinta pin (sigue listado en "Tus viajes"). Nunca rompe la home.

import { useEffect, useState } from 'react'
import { getGroupChallenges, splitByStatus } from '../../lib/groupData'
import { getAnswers } from '../../lib/challenges'
import { signedImageUrl } from '../../lib/storage'
import { haversine } from '../../lib/geo'
import type { RoutePoint } from '../../lib/trip'

export interface WorldTrip {
  /** Id del grupo (lo usamos como `challengeId` del RoutePoint: el click abre el viaje). */
  groupId: string
  /** Nombre del viaje (para el alt/tooltip del pin; el mapa no lo pinta). */
  name: string
  lat: number
  lng: number
  /** URL firmada de la foto de portada del viaje, o null (el pin cae a marcador genérico). */
  imageUrl: string | null
  /** Fecha del momento representativo en ISO (RoutePoint la pide para ordenar). */
  date: string
}

export interface WorldData {
  /** Un punto por viaje con coordenada resoluble. Vacío hasta que resuelve el lote. */
  trips: WorldTrip[]
  /** Suma de las distancias entre puntos consecutivos (km), para el caption del globo. */
  totalKm: number
  loading: boolean
}

const EMPTY: WorldData = { trips: [], totalKm: 0, loading: true }

/**
 * Resuelve la coordenada + portada representativa de UN grupo. Tomamos el último
 * reto CERRADO con respuesta visible (el más reciente del viaje) como "dónde está"
 * el viaje en el mundo, y su foto como portada del pin. Si el grupo no tiene ningún
 * reto cerrado con coordenada visible (RLS, viaje recién creado…), devuelve null y
 * el viaje no pinta pin. Cualquier error se propaga (lo captura allSettled arriba).
 */
async function resolveTrip(groupId: string, name: string): Promise<WorldTrip | null> {
  const challenges = await getGroupChallenges(groupId)
  const { past } = splitByStatus(challenges)
  if (past.length === 0) return null

  // `past` viene en orden DESC (más reciente primero): el primero con coordenada
  // visible es el momento representativo del viaje.
  const answers = await getAnswers(past.map((c) => c.id))
  const pick = past.find((c) => answers.has(c.id))
  if (!pick) return null
  const coord = answers.get(pick.id)
  if (!coord) return null

  // Portada: la foto del momento elegido si la tiene; firmamos su path (bucket privado).
  // Un fallo al firmar no debe tumbar el pin: cae a marcador genérico (imageUrl null).
  let imageUrl: string | null = null
  if (pick.image_path) {
    try {
      imageUrl = await signedImageUrl(pick.image_path)
    } catch {
      imageUrl = null
    }
  }

  return { groupId, name, lat: coord.lat, lng: coord.lng, imageUrl, date: pick.created_at }
}

/** Suma de tramos consecutivos (km) entre los puntos, en su orden de llegada. */
function sumKm(trips: WorldTrip[]): number {
  let total = 0
  for (let i = 1; i < trips.length; i++) {
    total += haversine(trips[i - 1], trips[i])
  }
  return Math.round(total)
}

/**
 * Hook del mapamundi: dado el listado de viajes del usuario (id + nombre), resuelve
 * en LOTE una coordenada representativa por viaje. Tolerante a fallo (allSettled):
 * los viajes que no resuelvan se omiten del mapa sin afectar al resto. La lista de
 * viajes que recibe ya la ha cargado la home, así que esto solo añade las coords.
 */
export function useWorldTrips(groups: { id: string; name: string }[]): WorldData {
  const [data, setData] = useState<WorldData>(EMPTY)
  // Clave estable del conjunto de grupos: re-resolvemos solo si cambia la lista.
  const key = groups.map((g) => g.id).join(',')

  useEffect(() => {
    if (groups.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado terminal sin grupos
      setData({ trips: [], totalKm: 0, loading: false })
      return
    }
    let cancelled = false
    void (async () => {
      const settled = await Promise.allSettled(groups.map((g) => resolveTrip(g.id, g.name)))
      if (cancelled) return
      const trips = settled
        .filter((r): r is PromiseFulfilledResult<WorldTrip | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((t): t is WorldTrip => t !== null)
      setData({ trips, totalKm: sumKm(trips), loading: false })
    })()
    return () => {
      cancelled = true
    }
    // `key` resume la lista de grupos; `groups` se re-lee dentro (no re-dispara solo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return data
}

/** Mapea los viajes del mundo a RoutePoint (contrato del mapa de viaje reusado). */
export function tripsToRoute(trips: WorldTrip[]): RoutePoint[] {
  return trips.map((t) => ({
    challengeId: t.groupId, // el "challengeId" del pin es el groupId: el click abre el viaje
    lat: t.lat,
    lng: t.lng,
    title: t.name,
    imageUrl: t.imageUrl,
    date: t.date,
  }))
}
