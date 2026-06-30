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

/**
 * TOLERANCIA del reto de NÚMERO ("¿Cuánto?"): calibra cómo de estricto es el conteo
 * del error de la cifra. Elige la "constante de caída" k de 5000·e^(−error_relativo/k).
 * A menor k, la puntuación cae más rápido con el error (más estricto). Coincide 1:1
 * con `challenges.number_tolerance` (BD) y con el CASE de la RPC `submit_number_vote`
 * (migración 0029): hay que cambiar ambos a la vez.
 */
export type NumberTolerance = 'indulgente' | 'normal' | 'estricto'

/** Constante de caída k por tolerancia. Debe replicar el CASE de submit_number_vote. */
export const NUMBER_DECAY_K: Record<NumberTolerance, number> = {
  indulgente: 0.5, // un error grande aún puntúa bastante
  normal: 0.25, // equilibrado (default)
  estricto: 0.1, // casi hay que clavar la cifra
}

/** Tolerancia por defecto: 'normal'. */
export const DEFAULT_NUMBER_TOLERANCE: NumberTolerance = 'normal'

/**
 * Puntos del reto de NÚMERO a partir del error absoluto y la respuesta correcta.
 * Replica EXACTO la RPC `submit_number_vote` (0029): el error se normaliza por la
 * magnitud de la respuesta (error RELATIVO; ε=1 evita dividir por 0 si la respuesta
 * es 0), así el scoring es invariante de escala (50 y 50.000 con el mismo % de error
 * → mismos puntos). Fórmula: 5000·e^(−(absError/max(|answer|,1))/k). Para lectura
 * local/tests; la autoridad de la puntuación es la RPC.
 */
export function scoreForNumber(
  absError: number,
  answer: number,
  tolerance: NumberTolerance = DEFAULT_NUMBER_TOLERANCE,
): number {
  const k = NUMBER_DECAY_K[tolerance]
  const relError = absError / Math.max(Math.abs(answer), 1)
  return Math.max(0, Math.round(5000 * Math.exp(-relError / k)))
}

/** Formatea una distancia en km a texto legible (m / km). */
export function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

/**
 * Formatea una cifra del reto de NÚMERO ("¿Cuánto?") en formato es-ES (coma
 * decimal, punto de millares) con los decimales fijos del reto (0–4). La unidad,
 * si la hay, se añade tras un espacio (p. ej. "84,50 €"). Sin unidad → solo la
 * cifra. Lo usa el revelado, el marcador y la lectura en vivo de crear.
 */
export function fmtNumber(value: number, decimals = 0, unit?: string | null): string {
  const n = value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return unit ? `${n} ${unit}` : n
}

/**
 * Error relativo con signo (porcentaje) frente a la respuesta del reto de número:
 * positivo si la adivinanza se pasó, negativo si se quedó corta. Para el marcador
 * ("+42 %", "−15 %"). ε=1 en el divisor evita dividir por 0 (igual que el scoring).
 */
export function signedRelErrorPct(guess: number, answer: number): string {
  const rel = (guess - answer) / Math.max(Math.abs(answer), 1)
  const pct = Math.round(rel * 100)
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct)} %`
}
