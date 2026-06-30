import { DEFAULT_SCORE_SCALE, haversine, scoreFor, type LatLng, type ScoreScale } from './geo'

export interface Result {
  km: number
  points: number
}

/**
 * Resultado de una jugada: distancia (km) entre la respuesta del jugador y la
 * ubicación real, y los puntos que otorga esa distancia (según la precisión del
 * reto). Pura: no toca red. La autoridad sigue siendo `submit_vote` (servidor);
 * `scale` por defecto 'mundo' mantiene el cálculo histórico cuando no se pasa.
 */
export function computeResult(
  guess: LatLng,
  answer: LatLng,
  scale: ScoreScale = DEFAULT_SCORE_SCALE,
): Result {
  const km = haversine(guess, answer)
  return { km, points: scoreFor(km, scale) }
}
