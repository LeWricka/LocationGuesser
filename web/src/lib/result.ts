import { DECAY_FALLBACK_KM, haversine, scoreFor, type LatLng } from './geo'

export interface Result {
  km: number
  points: number
}

/**
 * Resultado de una jugada: distancia (km) entre la respuesta del jugador y la
 * ubicación real, y los puntos de DISTANCIA que otorga (issue #994: el decay
 * viene auto-calibrado por el viaje; por defecto el respaldo 'país'). Pura: no
 * toca red. La autoridad sigue siendo `submit_vote` (servidor).
 */
export function computeResult(
  guess: LatLng,
  answer: LatLng,
  decayKm: number = DECAY_FALLBACK_KM,
): Result {
  const km = haversine(guess, answer)
  return { km, points: scoreFor(km, decayKm) }
}
