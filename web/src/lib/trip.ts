/**
 * Tipos del modelo "Viaje" — la frontera limpia entre la capa de datos (lib +
 * el hook `useTripData`) y la presentación (TripMap, MomentCard, MomentSheet).
 * El pivote es solo de PRESENTACIÓN: en BD seguimos hablando de `groups` y
 * `challenges` (snake_case). Aquí traducimos al lenguaje de viaje: un grupo es
 * un viaje y cada reto es un "momento" del recorrido.
 */

/**
 * Estado de un momento, derivado en cliente sin BD extra (ver `useTripData`):
 *  - `recuerdo` = momento SIN reto (`is_challenge = false`): foto + lugar visible +
 *                 texto, sin respuesta oculta ni plazo. Su lugar se pinta siempre.
 *  - `active`   = reto en juego (su plazo aún no ha vencido, `isLive`).
 *  - `closed`   = reto cerrado (plazo vencido). Ya está "clavado" en el mapa.
 *  - `practice` = reto de práctica (plazo a más de un año, `isPracticeChallenge`).
 */
import type { CountryInfo } from './countryFlag'

export type MomentStatus = 'recuerdo' | 'active' | 'closed' | 'practice'

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
  /** Descripción del día (texto libre del dueño), o null si no la han escrito. Migración 0021. */
  description: string | null
  status: MomentStatus
  /**
   * ¿Lleva capa de RETO (`is_challenge = true`) o es un RECUERDO puro? La UI lo usa
   * para decidir badge "🎯 Reto", "Adivina →" y la acción "Convertir en reto". 0022.
   */
  isChallenge: boolean
  /**
   * Tipo del reto (`challenge_kind`, migración 0029): 'location' (adivina
   * dónde) o 'number' (adivina cuánto). No es spoiler (ver `lib/challenges.ts`).
   * `undefined` para un RECUERDO puro (no tiene tipo de reto) o para fixtures
   * que no lo necesitan; el compartir-de-un-reto-suelto (issue #880) es el
   * único consumidor hoy, para elegir el placeholder sin foto (globo/obturador).
   */
  challengeKind?: 'location' | 'number'
  /**
   * Fecha del momento: `happened_on` (fecha ELEGIDA por el dueño, `YYYY-MM-DD`,
   * sin hora ni huso — migración 0037, issue #566) si existe; si no,
   * `created_at` (ISO completo, proxy de siempre para momentos legado sin
   * fecha propia). El diario ORDENA por este mismo criterio (ver `useTripData`);
   * quien la formatee debe distinguir los dos formatos (`parseMomentDate`,
   * `lib/time.ts`) para no desplazar el día en husos horarios al oeste de UTC.
   */
  date: string
  /**
   * Instante de cierre del reto en ISO (`deadline_at`): alimenta la cuenta atrás.
   * `null` para un RECUERDO (no caduca, no tiene cuenta atrás). 0022.
   */
  deadlineAt: string | null
  /** URL firmada de la foto (bucket privado), o null si el momento no tiene foto. */
  imageUrl: string | null
  /** Path en Storage de la foto (para re-firmar/lightbox), o null si no hay foto. */
  imagePath: string | null
  /**
   * URL firmada de la nota de voz (bucket privado), o null si no tiene. Opcional
   * (`?`) para no obligar a todos los fixtures/constructores de `Moment` ya
   * existentes (galería visual, tests) a rellenarla: ausente se trata como sin
   * nota de voz. Migración 0035.
   */
  audioUrl?: string | null
  /** Path en Storage de la nota de voz (para re-firmar), o null/ausente si no hay. */
  audioPath?: string | null
  /**
   * URL firmada del clip de vídeo corto (v1: uno solo), o null/ausente si no
   * tiene. Migración 0036. SOLO se rellena para RECUERDOS (`useTripData` la
   * consulta aparte, filtrando `is_challenge = false`): un reto nunca la
   * lleva, ni siquiera si el recuerdo de origen tenía clip
   * (`promoteToChallenge` lo vacía) — un MP4 puede llevar su propio GPS en los
   * metadatos del contenedor, así que nunca debe llegar al contexto de jugar.
   */
  videoUrl?: string | null
  /**
   * Coordenada a pintar en el mapa. Para un RECUERDO es su lugar VISIBLE
   * (`place_lat`/`place_lng`), siempre que lo tenga. Para un RETO es la respuesta:
   * null mientras esté activo (anti-spoiler), visible solo si cerrado/ya jugado.
   */
  lat: number | null
  lng: number | null
  /** Nº de jugadores distintos que ya han adivinado este momento (real, derivado de votos). */
  guessedCount: number
  /**
   * ¿Lo creó el usuario de la sesión actual (`created_by === user.id`)? Derivado en
   * `useTripData`, NUNCA leído directo de BD aquí. Gobierna el CTA "Adivina →" de un
   * reto EN JUEGO: el creador no puede jugar su propio reto (guarda de #513), así
   * que en un momento propio la tarjeta no promete esa acción (issue #578).
   */
  isOwn: boolean
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
  /**
   * Si `isChallenge` y hay foto, ¿se sirve como PISTA visible (true) o se
   * reserva SORPRESA para el revelado (false)? Espejo de `challenges.photo_is_hint`
   * (0022), añadido aquí para que la pestaña Fotos (issue #645) sepa si puede
   * enseñar la foto de un reto EN JUEGO sin destriparlo. Irrelevante en un
   * recuerdo (su foto nunca es spoiler) — ver `isMomentPhotoVisible`.
   */
  photoIsHint?: boolean
}

/**
 * ¿Se puede mostrar la foto de este momento FUERA del contexto del propio reto
 * (p.ej. la pestaña Fotos, issue #645)? Reglas anti-spoiler:
 *  - un RECUERDO nunca es spoiler: su foto es contenido, no respuesta;
 *  - un RETO ya CERRADO ya está revelado: da igual si su foto era pista o sorpresa;
 *  - un RETO en juego (activo o práctica) con foto PISTA (`photoIsHint: true`)
 *    tampoco es secreta: ya se ve así en el carrusel del Diario;
 *  - un RETO en juego con foto SORPRESA (`photoIsHint: false`) SÍ debe ocultarse:
 *    enseñarla antes del revelado destriparía la respuesta.
 */
export function isMomentPhotoVisible(
  moment: Pick<Moment, 'isChallenge' | 'status' | 'photoIsHint'>,
): boolean {
  if (!moment.isChallenge) return true
  if (moment.status === 'closed') return true
  return moment.photoIsHint === true
}

/** Foto a pintar de un momento, más si debe llevar el sello "Sorpresa" (issue #655). */
export interface MomentPhotoDisplay {
  /** URL a pintar, o `null` si debe ocultarse del todo (placeholder de marca + candado). */
  src: string | null
  /** ¿Sigue siendo sorpresa para el RESTO del grupo? Gobierna el sello, se pinte o no la foto. */
  surprise: boolean
}

/**
 * Qué foto pintar de un momento en CUALQUIER superficie (carrusel del Diario,
 * hoja de detalle, recap de cierre…) y si necesita el sello "Sorpresa" — el
 * mismo anti-spoiler de `isMomentPhotoVisible` (pestaña Fotos, #645), con la
 * única excepción del creador:
 *  - visible para cualquiera (`isMomentPhotoVisible`): se pinta tal cual, sin sello;
 *  - oculta para el resto pero el momento es MÍO (`isOwn`): la sigo viendo (es mi
 *    propia foto — ocultármela a mí no protege nada), pero con el sello, para que
 *    sepa que el resto del grupo aún no la ve;
 *  - oculta para cualquier otro: `src: null` (placeholder de marca) + sello.
 */
export function resolveMomentPhoto(
  moment: Pick<Moment, 'isChallenge' | 'status' | 'photoIsHint' | 'isOwn' | 'imageUrl'>,
): MomentPhotoDisplay {
  if (isMomentPhotoVisible(moment)) return { src: moment.imageUrl, surprise: false }
  return { src: moment.isOwn ? moment.imageUrl : null, surprise: true }
}

// Meses en español, en el mismo orden y grafía que produce
// `Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })` (ver
// `buildDescription`, código legado pre-migración-0037/#566): minúsculas, sin
// acentos en las terminaciones que los llevan tal cual las da el motor de JS.
const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

// Antes de la migración 0037 (issue #566) un momento no tenía fecha propia
// (`happened_on`): si el dueño elegía un día distinto de hoy, la única forma de
// guardarlo era incrustar `📅 <día> de <mes>` al principio de `description`
// (opcionalmente ` · <cuerpo>` si además escribía texto). Ese texto sigue tal
// cual en BD para los momentos antiguos — no hay forma fiable de "migrar" la
// fecha real desde ahí (issue #686), así que esto es una transformación de
// PRESENTACIÓN al leer: separa el prefijo de fecha del cuerpo para poder
// pintarlos por separado (el emoji suelto delante del texto es lo que rompía
// la letra capitular de `.description::first-letter`, issue raíz de #686).
const LEGACY_DATE_PREFIX_RE = new RegExp(
  `^📅\\s+(\\d{1,2}\\s+de\\s+(?:${SPANISH_MONTHS.join('|')}))(?:\\s*·\\s*([\\s\\S]*))?$`, // design-lint-allow: el emoji es el DATO legado a detectar en BD, no UI pintada
  'i',
)

/**
 * Separa el prefijo de fecha legado (ver `LEGACY_DATE_PREFIX_RE`) de una
 * descripción, si lo lleva:
 *  - `dateLabel`: el texto de fecha SIN el emoji (p.ej. `"17 de julio"`), o
 *    `null` si la descripción no llevaba el prefijo.
 *  - `text`: el cuerpo tras el separador ` · `, o `null` si no había cuerpo
 *    (prefijo solo) o si la descripción de entrada era `null`. Sin prefijo,
 *    `text` es la descripción original tal cual.
 */
export function parseLegacyDescription(description: string | null): {
  dateLabel: string | null
  text: string | null
} {
  if (description == null) return { dateLabel: null, text: null }
  const match = description.match(LEGACY_DATE_PREFIX_RE)
  if (!match) return { dateLabel: null, text: description }
  const [, dateLabel, body] = match
  return { dateLabel, text: body && body.trim() !== '' ? body : null }
}

/**
 * Ids de RETO "asociados" a un recuerdo del mismo viaje porque comparten el
 * MISMO `image_path` — sin FK entre ambos, es la única señal disponible (issue
 * #821/#822: un reto creado a partir de la foto de un recuerdo, `fromMomentId`
 * en `CreateChallengeFlow`, sin sustituir la foto prefijada). Heurística
 * SEGURA: cada subida genera un path con `crypto.randomUUID()` (`lib/storage.ts`),
 * así que dos fotos distintas nunca coinciden por casualidad — la única forma
 * de que dos filas compartan el string exacto es que una copiara literalmente
 * el `image_path` de la otra, el caso real que describe el dueño.
 *
 * Un reto SORPRESA aún sin revelar (`isMomentPhotoVisible` false) NUNCA entra
 * aquí: enseñar "esto viene de aquel recuerdo" antes de tiempo sería un spoiler
 * en sí mismo (aunque el marcador no diga CUÁL recuerdo). Se filtra en el
 * origen (no en la UI) para que ninguna otra pantalla tenga que acordarse de
 * repetir la guarda.
 */
export function associatedChallengeIds(
  moments: Pick<Moment, 'challengeId' | 'isChallenge' | 'imagePath' | 'status' | 'photoIsHint'>[],
): Set<string> {
  const memoryPaths = new Set(
    moments.filter((m) => !m.isChallenge && m.imagePath != null).map((m) => m.imagePath as string),
  )
  const out = new Set<string>()
  if (memoryPaths.size === 0) return out
  for (const m of moments) {
    if (!m.isChallenge || m.imagePath == null) continue
    if (!isMomentPhotoVisible(m)) continue
    if (memoryPaths.has(m.imagePath)) out.add(m.challengeId)
  }
  return out
}

/**
 * Para cada recuerdo, el reto ASOCIADO del que nace (mismo `image_path`, ver
 * `associatedChallengeIds`) — la relación INVERTIDA (de challengeId → memoryId
 * a memoryId → challenge completo), para que Bitácora y Diario puedan
 * FUSIONAR el par en una sola entrada (issue #839: dos entradas con la MISMA
 * foto se leían como contenido duplicado, no como "el juego de aquel
 * momento"). Un recuerdo con más de un reto asociado (raro: promocionado dos
 * veces) se queda con el PRIMERO en el orden de `moments` — desempate estable,
 * no hay forma fiable de saber cuál "es el bueno".
 */
export function pairedChallengeByMemoryId(moments: Moment[]): Map<string, Moment> {
  const associatedIds = associatedChallengeIds(moments)
  const out = new Map<string, Moment>()
  if (associatedIds.size === 0) return out
  const memoryIdByPath = new Map<string, string>()
  for (const m of moments) {
    if (!m.isChallenge && m.imagePath != null) memoryIdByPath.set(m.imagePath, m.challengeId)
  }
  for (const m of moments) {
    if (!associatedIds.has(m.challengeId) || m.imagePath == null) continue
    const memoryId = memoryIdByPath.get(m.imagePath)
    if (memoryId != null && !out.has(memoryId)) out.set(memoryId, m)
  }
  return out
}

/**
 * Fusiona un recuerdo con su reto ASOCIADO (`pairedChallengeByMemoryId`) en UNA
 * sola entrada de PRESENTACIÓN para el Diario (issue #839): conserva la
 * IDENTIDAD y el contenido del recuerdo (id de pin/selección en el mapa, foto,
 * lugar, fecha — su foto es SIEMPRE visible, nunca spoiler) pero adopta el
 * ESTADO DE JUEGO del reto (chip "EN JUEGO"/reto, cuenta de jugadas, plazo,
 * guarda "no puedo jugar lo mío"). Así `MomentCard` pinta una única tarjeta
 * con la cara del recuerdo y el pulso del reto, sin repetir la foto.
 *
 * El `challengeId` del resultado es el del RECUERDO a propósito: quien llama
 * (`TripDiario`) lo sigue usando para el pin del mapa y la selección — el id
 * REAL del reto (para lanzar "Adivina") vive aparte, en `challenge.challengeId`.
 */
export function fuseMemoryWithChallenge(memory: Moment, challenge: Moment): Moment {
  return {
    ...memory,
    isChallenge: true,
    status: challenge.status,
    deadlineAt: challenge.deadlineAt,
    isOwn: challenge.isOwn,
    guessedCount: challenge.guessedCount,
    guessSeconds: challenge.guessSeconds,
    svPanoId: challenge.svPanoId,
    photoIsHint: challenge.photoIsHint,
  }
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
