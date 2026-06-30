export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Distancia en km entre dos puntos sobre la esfera (haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(x)))
}

/**
 * PRECISIÓN del reto: calibra cómo de estricto es el conteo de distancia. Elige la
 * "distancia característica" D de la fórmula 5000·e^(−km/D). A menor D, la puntuación
 * cae más rápido con los km (más estricto). Coincide 1:1 con `challenges.score_scale`
 * (BD) y con el CASE de la RPC `submit_vote` (migración 0028): hay que cambiar ambos
 * a la vez. 'mundo' = D=2000 = comportamiento histórico (cero regresión).
 */
export type ScoreScale = 'mundo' | 'pais' | 'ciudad' | 'barrio'

/** Distancia característica D (km) por precisión. Debe replicar el CASE de submit_vote. */
export const SCORE_DECAY_KM: Record<ScoreScale, number> = {
  mundo: 2000, // indulgente: acertar el continente/país lejano (comportamiento actual)
  pais: 300, // acertar el país / la región
  ciudad: 25, // acertar la ciudad
  barrio: 2, // muy estricto: casi la calle
}

/** Precisión por defecto: 'mundo' = exactamente el scoring de siempre. */
export const DEFAULT_SCORE_SCALE: ScoreScale = 'mundo'

/**
 * Puntos del reto a partir de la distancia: 5000·e^(−km/D). D sale de la precisión
 * (`scale`); por defecto 'mundo' (D=2000) → la fórmula histórica 5000·e^(−km/2000).
 */
export function scoreFor(km: number, scale: ScoreScale = DEFAULT_SCORE_SCALE): number {
  const decay = SCORE_DECAY_KM[scale]
  return Math.max(0, Math.round(5000 * Math.exp(-km / decay)))
}

/** Formatea una distancia en km a texto legible (m / km). */
export function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
