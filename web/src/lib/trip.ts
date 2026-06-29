/**
 * Tipos del modelo "Viaje" — la frontera limpia entre la capa de datos (lib +
 * el hook `useTripData`) y la presentación (TripMap, MomentCard, MomentSheet).
 * El pivote es solo de PRESENTACIÓN: en BD seguimos hablando de `groups` y
 * `challenges` (snake_case). Aquí traducimos al lenguaje de viaje: un grupo es
 * un viaje y cada reto es un "momento" del recorrido.
 */

/**
 * Estado de un momento, derivado en cliente sin BD extra (ver `useTripData`):
 *  - `active`   = en juego (su plazo aún no ha vencido, `isLive`).
 *  - `closed`   = cerrado (plazo vencido). Ya está "clavado" en el mapa.
 *  - `practice` = reto de práctica (plazo a más de un año, `isPracticeChallenge`).
 */
import type { CountryInfo } from './countryFlag'

export type MomentStatus = 'active' | 'closed' | 'practice'

/**
 * Un momento del viaje (un reto, en lenguaje de juego). Reúne lo que la pantalla
 * necesita para una tarjeta y para situarlo (o no) en el mapa.
 *
 * REGLA ANTI-SPOILER: `lat`/`lng` solo se rellenan para momentos CERRADOS (o ya
 * jugados por mí), porque la respuesta de un momento ACTIVO revelaría dónde es.
 * Un momento activo lleva `lat === null && lng === null` a propósito: el mapa lo
 * pinta flotando, no clavado en su sitio real.
 */
export interface Moment {
  challengeId: string
  title: string
  status: MomentStatus
  /** Fecha del momento en ISO (usamos `created_at`: cuándo se añadió al viaje). */
  date: string
  /** URL firmada de la foto (bucket privado), o null si el momento no tiene foto. */
  imageUrl: string | null
  /** Path en Storage de la foto (para re-firmar/lightbox), o null si no hay foto. */
  imagePath: string | null
  /** Coordenada real; null mientras el momento esté activo (anti-spoiler) o sin respuesta visible. */
  lat: number | null
  lng: number | null
  /** Nº de jugadores distintos que ya han adivinado este momento (real, derivado de votos). */
  guessedCount: number
  /** Segundos por jugada del reto; null = sin límite. */
  guessSeconds: number | null
  /** Panorama de Street View encajado al momento, o null si no tiene. */
  svPanoId: string | null
  /**
   * País resuelto desde lat/lng (bandera + nombre), estilo Polarsteps. Solo los
   * momentos CERRADOS con coordenada pueden tenerlo; se rellena de forma
   * ESCALONADA y NO bloqueante en `useTripData` (anti rate-limit de Nominatim).
   * `undefined` = aún sin resolver; `null` = resuelto y sin país (mar abierto, etc.).
   */
  country?: CountryInfo | null
}

/**
 * Punto de la RUTA en el mapa. Solo existen para momentos CERRADOS con lat/lng
 * visible: son los que la polyline "cose" en orden cronológico. Por eso lat/lng
 * aquí son obligatorios (a diferencia de `Moment`, que admite null para activos).
 */
export interface RoutePoint {
  challengeId: string
  lat: number
  lng: number
  title: string
  /** URL firmada de la miniatura para el pin-foto, o null (cae a un marcador genérico). */
  imageUrl: string | null
  /** Fecha del momento en ISO, para ordenar la ruta. */
  date: string
}
