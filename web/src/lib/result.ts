import { haversine, scoreFor, type LatLng } from './geo'

export interface Result {
  km: number
  points: number
}

/**
 * Resultado de una jugada: distancia (km) entre la respuesta del jugador y la
 * ubicación real, y los puntos que otorga esa distancia. Pura: no toca red.
 */
export function computeResult(guess: LatLng, answer: LatLng): Result {
  const km = haversine(guess, answer)
  return { km, points: scoreFor(km) }
}
