// Resolución CANÓNICA de los "momentos visibles" de un viaje y su portada —
// compartida entre el mapamundi de la home (`features/home/useWorldTrips`) y la
// tarjeta de invitación (`features/group/tripInviteCover`). Antes de #619 cada una
// resolvía la portada por su cuenta y podían discrepar: la invitación mostraba la
// foto del ÚLTIMO reto/recuerdo aunque no fuera el que la home enseña como portada
// del viaje. Ahora AMBAS pasan por aquí.
//
// REGLA ANTI-SPOILER (idéntica a la que ya aplicaba `useWorldTrips`): un momento
// solo cuenta como "visible" si su coordenada ya se puede enseñar —el lugar de un
// RECUERDO (`place_lat`/`place_lng`) o la respuesta de un RETO YA CERRADO (vía
// `getAnswers`, que la RLS solo sirve para cerrados/ya votados)—. Un reto ABIERTO
// nunca aporta momento: revelaría dónde es.
//
// CRITERIO DE PORTADA: entre los momentos visibles, en el mismo orden DESC (más
// reciente primero) en que `getGroupChallenges` + `splitByStatus` devuelven `past`,
// la portada es la foto del PRIMERO con `image_path`; si ninguno tiene foto, cae al
// `image_path` (puede ser null) del momento visible más reciente; si no hay ningún
// momento visible, no hay portada canónica.

import { getGroupChallenges, splitByStatus } from './groupData'
import { getAnswers } from './challenges'

/**
 * Guarda de rangos: lat ∈ [−90, 90] y lng ∈ [−180, 180]. Descarta cualquier par de
 * coordenadas fuera de rango (p.ej. lat/lng intercambiados: lat=135 caería en el mar).
 * Tolerante: un punto inválido simplemente no cuenta como visible (no revienta el mapa).
 * Exportada para test: permite verificar que el guard opera en los casos límite.
 */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/** Un momento del viaje con coordenada VISIBLE (recuerdo situado o reto cerrado con respuesta). */
export interface VisibleTripMoment {
  /** Id del reto/recuerdo (clave estable, p.ej. para el pin del globo). */
  id: string
  title: string
  image_path: string | null
  created_at: string
  lat: number
  lng: number
}

/**
 * Resuelve los momentos VISIBLES de un viaje, en el mismo orden DESC (más reciente
 * primero) que expone `getGroupChallenges`. Ver el contrato de arriba (regla
 * anti-spoiler). Vacío si el viaje no tiene ningún momento visible.
 */
export async function resolveVisibleTripMoments(groupId: string): Promise<VisibleTripMoment[]> {
  const challenges = await getGroupChallenges(groupId)
  // `splitByStatus` separa retos ABIERTOS (anti-spoiler: sin coordenada) de los demás.
  const { past } = splitByStatus(challenges)
  if (past.length === 0) return []

  // Respuestas de los retos cerrados (la RLS solo sirve las visibles). Los recuerdos
  // no necesitan respuesta: su lugar visible va en place_lat/place_lng.
  const challengeIds = past.filter((c) => c.is_challenge).map((c) => c.id)
  const answers = await getAnswers(challengeIds)

  const moments: VisibleTripMoment[] = []
  for (const c of past) {
    if (c.is_challenge) {
      const ans = answers.get(c.id)
      if (ans && isValidLatLng(ans.lat, ans.lng)) {
        moments.push({
          id: c.id,
          title: c.title,
          image_path: c.image_path,
          created_at: c.created_at,
          lat: ans.lat,
          lng: ans.lng,
        })
      }
    } else if (c.place_lat != null && c.place_lng != null) {
      // Recuerdo con lugar visible (no es spoiler).
      if (isValidLatLng(c.place_lat, c.place_lng)) {
        moments.push({
          id: c.id,
          title: c.title,
          image_path: c.image_path,
          created_at: c.created_at,
          lat: c.place_lat,
          lng: c.place_lng,
        })
      }
    }
  }
  return moments
}

/**
 * Portada canónica a partir de los momentos visibles (ya en orden DESC): el
 * `image_path` del primero con foto; si ninguno tiene, el del más reciente (puede
 * ser null); si no hay momentos, null. Función pura: la comparten
 * `useWorldTrips.resolveTrip` y `resolveTripInviteCover`.
 */
export function pickTripCoverImagePath(
  moments: Pick<VisibleTripMoment, 'image_path'>[],
): string | null {
  if (moments.length === 0) return null
  return moments.find((m) => m.image_path)?.image_path ?? moments[0].image_path
}
