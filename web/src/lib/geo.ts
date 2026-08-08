export interface LatLng {
  lat: number
  lng: number
}

/**
 * ¿Coordenada usable para encuadrar la cámara de un mapa MapLibre? (issues #923 y
 * #964, Sentry LOCATIONGUESSER-9). Un valor no finito (NaN/Infinity, dato
 * corrupto), fuera de rango, o el sentinel clásico "sin coordenada real" (0,0,
 * "null island") produce un bounds degenerado: `fitBounds`/`cameraForBounds` se lo
 * pasan tal cual a maplibre-gl y, en proyección GLOBO, su helper de cámara
 * (`GlobeCameraHelper.cameraForBoxAndBearing`) revienta leyendo `.center` de un
 * resultado `undefined` — el `TypeError: Cannot read properties of undefined
 * (reading 'center')` del stack de Sentry. Filtrar ANTES de decidir el gesto de
 * cámara (0/1/≥2 puntos) es más robusto que solo envolver la llamada en try/catch:
 * evita construir un encuadre sin sentido en primer lugar, no solo absorber su
 * fallo a posteriori. Compartida por `HomeGlobe` (#923) y `TripMapGlobe` (#964):
 * mismo bug, mismo guard.
 */
export function isValidLatLng({ lat, lng }: LatLng): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  if (lat === 0 && lng === 0) return false
  return true
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

// ── Scoring AUTO-CALIBRADO por viaje (issue #994, estilo GeoGuessr) ──────────
// GeoGuessr puntúa 5000·e^(−10·d/D_mapa) con D_mapa = la diagonal del mapa que
// juegas — el jugador nunca elige "precisión", sale sola del área de juego.
// Aquí el "mapa" es EL VIAJE: la exigencia se deriva de cuánto se extienden sus
// puntos ubicados. Sustituye al selector mundo/país/ciudad/barrio (score_scale,
// hoy columna legacy), que confundía a los creadores reales.
// ESPEJO EXACTO de la RPC `submit_vote` (migración 0052): cambiar una constante
// implica cambiar la otra. La autoridad sigue siendo el servidor.

/**
 * SUELO de puntos para todo voto ENVIADO (con adivinanza) — issue #956. Con
 * guess, nunca menos de esto: falla el país y aun así puntúa algo. NO aplica a
 * timeouts (sin guess: 0, no pasan por `scoreFor`).
 */
export const MIN_GUESS_POINTS = 250
/** Bonus máximo de rapidez (ADITIVO, issue #994): desempata entre adivinanzas
 * parecidas; jamás voltea una diferencia real de distancia (el viejo factor
 * multiplicativo ×0.5–×1.0 sí lo hacía). */
export const SPEED_BONUS_MAX = 250
/** Decay mínimo (km) — la vieja escala 'ciudad': viajes urbanos siguen jugables. */
export const DECAY_MIN_KM = 25
/** Decay máximo (km) — la vieja escala 'mundo'. */
export const DECAY_MAX_KM = 2000
/** decay = diagonal_del_viaje / divisor. /6 y no el /10 literal de GeoGuessr:
 * su D es un mapa curado (generoso); el nuestro es data-driven de fotos reales
 * (más compacto) — con /10 todo fallo >550 km caía al suelo sin discriminar
 * (simulado con datos reales del grupo Filipinas). */
export const DECAY_DIVISOR = 6
/** Respaldo con <2 puntos ubicados (primer reto de un viaje): la vieja escala
 * 'país' — el caso núcleo del producto es un viaje por un país. */
export const DECAY_FALLBACK_KM = 300

/**
 * Constante de caída (km) auto-calibrada por el tamaño del viaje: centroide
 * esférico (lng vía atan2 de medias de sin/cos — seguro cruzando el
 * antimeridiano) + 2×percentil-85 de las distancias al centroide como
 * "diagonal efectiva". NO un bounding box min/max: un solo punto outlier (la
 * foto del vuelo a 800 km) infla un bbox ×29 y trivializa el reto; el
 * percentil lo ignora (×1,02 medido). Réplica exacta del cálculo de la RPC.
 */
export function computeTripDecay(points: LatLng[]): number {
  if (points.length < 2) return DECAY_FALLBACK_KM
  const cLat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const meanSin = points.reduce((s, p) => s + Math.sin(toRad(p.lng)), 0) / points.length
  const meanCos = points.reduce((s, p) => s + Math.cos(toRad(p.lng)), 0) / points.length
  const cLng = (Math.atan2(meanSin, meanCos) * 180) / Math.PI
  const center = { lat: cLat, lng: cLng }
  const radii = points.map((p) => haversine(center, p)).sort((a, b) => a - b)
  const p85 = radii[Math.floor(0.85 * (radii.length - 1))]
  const diagonal = 2 * p85
  return Math.max(DECAY_MIN_KM, Math.min(DECAY_MAX_KM, diagonal / DECAY_DIVISOR))
}

/**
 * Puntos de DISTANCIA: max(SUELO, round(5000·e^(−km/decay))). El decay viene de
 * `computeTripDecay` (o del respaldo 'país' si el viaje aún no tiene puntos).
 * El bonus de rapidez va aparte (`speedBonusFor`) y se SUMA: máximo teórico
 * 5250. Válido solo para votos CON adivinanza (un timeout se puntúa 0 por otra
 * vía, sin pasar por aquí).
 */
export function scoreFor(km: number, decayKm: number = DECAY_FALLBACK_KM): number {
  return Math.max(MIN_GUESS_POINTS, Math.round(5000 * Math.exp(-km / decayKm)))
}

/**
 * Bonus ADITIVO de rapidez (issue #994): round(250·restante/límite). Las
 * condiciones de aplicación (time_scoring ON + límite + arranque registrado)
 * las decide el servidor; esto es el espejo puro del cálculo.
 */
export function speedBonusFor(elapsedSeconds: number, guessSeconds: number): number {
  if (guessSeconds <= 0) return 0
  const clamped = Math.max(0, Math.min(guessSeconds, elapsedSeconds))
  return Math.round((SPEED_BONUS_MAX * (guessSeconds - clamped)) / guessSeconds)
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

/** ¿La velocidad puntúa por defecto en un reto de lugar nuevo? Issue #628: ON. */
export const DEFAULT_TIME_SCORING = true

/**
 * FACTOR de velocidad del reto de LUGAR (issue #628): premia responder rápido,
 * penaliza tarde. `factor = 0.5 + 0.5·(1 − elapsed/límite)`, con `elapsed`
 * ACOTADO a [0, límite] — instantáneo ≈100%, al límite = 50%. Solo aplica con
 * `timeScoring` activo Y límite por jugada (`guessSeconds` no null; en 'Libre'
 * no hay nada que medir) Y un `elapsedSeconds` conocido; si falta cualquiera,
 * factor 1 (sin cambio). REPLICA la RPC `submit_vote` (migración 0034): la
 * puntuación real la calcula y devuelve el servidor (autoridad de servidor); esta
 * función es para el texto del revelado ("×0,9 por rapidez"), no para puntuar.
 */
export function speedFactor(
  elapsedSeconds: number | null,
  guessSeconds: number | null,
  timeScoring: boolean,
): number {
  if (!timeScoring || guessSeconds == null || elapsedSeconds == null) return 1
  const clamped = Math.max(0, Math.min(guessSeconds, elapsedSeconds))
  return 0.5 + 0.5 * (1 - clamped / guessSeconds)
}
