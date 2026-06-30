import { supabase } from './supabase'
import type { Challenge, Database } from './database.types'
import {
  DEFAULT_NUMBER_TOLERANCE,
  DEFAULT_SCORE_SCALE,
  type LatLng,
  type NumberTolerance,
  type ScoreScale,
} from './geo'
import { deadlineFromNow } from './time'

/** Tipo de reto: lugar (¿Dónde es?, histórico) o número (¿Cuánto?, adivinar una cifra). 0029. */
export type ChallengeKind = 'location' | 'number'

type ChallengeUpdate = Database['public']['Tables']['challenges']['Update']

/**
 * Reto SIN la respuesta (lat/lng). Es lo que se sirve al jugar: el payload del
 * mapa de adivinar NO debe contener la ubicación real. La respuesta vive en
 * `challenge_answers` y se obtiene solo al votar (vía RPC) o al recargar un reto
 * ya votado/cerrado (vía `getAnswer`, gobernado por RLS). Migración 0010.
 */
export type ChallengeForPlay = Omit<Challenge, 'lat' | 'lng'>

// Columnas del reto SIN lat/lng: lo que CUALQUIER lectura de `challenges` por el
// cliente puede pedir tras revocar el privilegio de columna lat/lng (migración 0010).
// La respuesta OCULTA del reto (lat/lng) NO es legible desde `challenges`; vive en
// `challenge_answers` (RLS). En cambio `place_lat`/`place_lng` (lugar VISIBLE de un
// recuerdo) e `is_challenge` SÍ se sirven: no son spoiler (0022). Reutilizado por
// todos los lectores: jugar, lista del grupo, home y el RETURNING de crear/editar.
// `score_scale` (0028) NO es spoiler (no revela la ubicación): es la precisión del
// reto. Se sirve para que la previsualización/score local coincida con el servidor.
// `challenge_kind` y los `number_*` (0029) tampoco son spoiler: describen el TIPO y la
// PREGUNTA del reto de número (no la cifra). Se sirven al jugar para montar la mecánica.
// La respuesta del número (`answer_number`) NO está aquí (vive oculta en
// challenge_answers); `answer_number_src` tampoco (privilegio de columna revocado, 0029).
export const CHALLENGE_COLUMNS_NO_ANSWER =
  'id, group_id, title, description, is_challenge, place_lat, place_lng, image_path, sv_pano_id, sv_heading, sv_pitch, sv_lock_move, sv_lock_rotate, guess_seconds, deadline_at, photo_is_hint, score_scale, challenge_kind, number_question, number_unit, number_decimals, number_tolerance, created_by, created_at'

export interface NewChallengeInput {
  title: string
  lat: number
  lng: number
  /** uuid del usuario de la sesión (`user.id`). Queda como `created_by` del reto. */
  createdBy: string
  /** Grupo al que pertenece el reto (siempre existe ya: flujo grupo-primero). */
  groupId: string
  /** Segundos por jugada; null = sin límite. (#13 añade la UI.) */
  guessSeconds?: number | null
  /** Plazo del reto en ISO absoluto; por defecto, 24 h desde ahora (duración relativa). */
  deadlineAt?: string
  /** Path en Storage de la imagen del reto (foto opcional, sin EXIF). */
  imagePath?: string
  /**
   * Si hay foto, ¿se muestra como pista al jugar (true) o se reserva sorpresa
   * para el revelado (false)? Por defecto pista. Sin efecto si no hay foto.
   */
  photoIsHint?: boolean
  /** Panorama de Street View encajado al punto. (#54.) */
  svPanoId?: string
  /** POV inicial del panorama: rumbo en grados. (#54.) */
  svHeading?: number
  /** POV inicial del panorama: inclinación en grados. (#54.) */
  svPitch?: number
  /** Candado de MOVIMIENTO del Street View (true = no se puede ir a panoramas contiguos). (#187.) */
  svLockMove?: boolean
  /** Candado de GIRO del Street View (true = no se puede mirar alrededor). (#187.) */
  svLockRotate?: boolean
  /**
   * Precisión del reto: calibra cómo de estricto es el conteo de distancia (0028).
   * Por defecto 'mundo' (D=2000 km) = el scoring de siempre. A menor escala, más
   * estricto: pais=300, ciudad=25, barrio=2 km.
   */
  scoreScale?: ScoreScale
}

// Plazo por defecto si el creador no eligió uno: 24 h desde ahora. La duración
// relativa sustituye al ambiguo "fin del día" (que dependía del huso del lector).
const DEFAULT_DURATION_HOURS = 24

// Umbral de "reto de práctica": un plazo a más de 365 días vista. Los retos
// reales duran como mucho ~48 h; solo los de práctica (p.ej. el infinito de
// Iruña, con cierre en el año 2999) caen tan lejos. Se usa para permitir "volver
// a jugar" SOLO en práctica: en un reto real, rejugar tras ver la respuesta sería
// trampa.
const PRACTICE_DEADLINE_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ¿Es un reto de PRÁCTICA? True si el plazo está a más de un año vista (los retos
 * reales son ≤48 h; el infinito de práctica cierra en 2999). Función pura para
 * gatear "volver a jugar" en la UI sin depender del servidor. Un momento SIN plazo
 * (recuerdo, `deadline_at = null` desde 0022) nunca es de práctica → false.
 */
export function isPracticeChallenge(deadlineAt: string | null): boolean {
  if (deadlineAt == null) return false
  const ms = new Date(deadlineAt).getTime() - Date.now()
  return ms > PRACTICE_DEADLINE_DAYS * DAY_MS
}

export async function createChallenge(
  input: NewChallengeInput,
): Promise<{ challenge: ChallengeForPlay; groupId: string }> {
  const groupId = input.groupId
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      group_id: groupId,
      title: input.title,
      lat: input.lat,
      lng: input.lng,
      image_path: input.imagePath ?? null,
      photo_is_hint: input.photoIsHint ?? true,
      sv_pano_id: input.svPanoId ?? null,
      sv_heading: input.svHeading ?? null,
      sv_pitch: input.svPitch ?? null,
      // Candados de exploración del SV (false = permitido por defecto). #187.
      sv_lock_move: input.svLockMove ?? false,
      sv_lock_rotate: input.svLockRotate ?? false,
      guess_seconds: input.guessSeconds ?? null,
      deadline_at: input.deadlineAt ?? deadlineFromNow(DEFAULT_DURATION_HOURS),
      // Precisión del scoring; 'mundo' (default) = comportamiento histórico (0028).
      score_scale: input.scoreScale ?? DEFAULT_SCORE_SCALE,
      created_by: input.createdBy,
    })
    // RETURNING sin lat/lng: tras revocar la columna (0010), pedirlas aquí daría
    // error de permiso. La respuesta ya queda espejada en challenge_answers abajo.
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error

  // La respuesta (`challenge_answers`) la escribe el TRIGGER `sync_challenge_answer`
  // (migración 0012, SECURITY DEFINER) en la misma transacción del INSERT del reto.
  // NO la escribimos desde el cliente: hacerlo provocaba `42501` (RLS de
  // challenge_answers) cuando un MIEMBRO no-dueño creaba el reto —el upsert chocaba
  // con la fila que ya había creado el trigger y caía en el camino UPDATE
  // (solo-dueño)—. El trigger es la única fuente de la respuesta.

  return { challenge: data, groupId }
}

/**
 * Datos para crear un reto de NÚMERO ("¿Cuánto?", 0029). HERMANO de
 * `NewChallengeInput` pero SIN ubicación: la respuesta es una cifra
 * (`answerNumber`), no un lat/lng. La pregunta, la unidad, los decimales y la
 * estrictez son metadatos VISIBLES; la cifra correcta es SPOILER.
 */
export interface NewNumberChallengeInput {
  title: string
  /** Pregunta visible al jugar (p. ej. "¿Cuánto creéis que nos costó?"). */
  question: string
  /**
   * Cifra correcta (SPOILER). Va a `answer_number_src`: se ESCRIBE pero NO se lee
   * (privilegio de SELECT revocado). El trigger la copia a
   * `challenge_answers.answer_number`; nunca viaja al cliente antes de votar.
   */
  answerNumber: number
  /** uuid del usuario de la sesión (`user.id`). Queda como `created_by` del reto. */
  createdBy: string
  /** Grupo al que pertenece el reto (siempre existe ya: flujo grupo-primero). */
  groupId: string
  /** Unidad a mostrar (€/km/kg/%/min u "otra", ≤8 car). Opcional: sin unidad si null/''. */
  unit?: string | null
  /** Decimales a mostrar (0–4); se infiere de cómo se escribe la respuesta. Default 0. */
  decimals?: number
  /** Estrictez del conteo del error relativo. Default 'normal'. */
  tolerance?: NumberTolerance
  /** Path en Storage de la imagen del reto (foto opcional, sin EXIF). */
  imagePath?: string
  /** Plazo del reto en ISO absoluto; por defecto, 24 h desde ahora. */
  deadlineAt?: string
  /** Segundos por jugada; null = sin límite. */
  guessSeconds?: number | null
}

/**
 * Crea un reto de NÚMERO ("¿Cuánto?"): `challenge_kind = 'number'`, sin ubicación.
 * La cifra correcta entra por `answer_number_src` (privilegio de SELECT revocado);
 * el trigger `sync_challenge_answer` (0029) la espeja a `challenge_answers.answer_number`
 * en la misma transacción. Por eso NO escribimos `challenge_answers` desde el cliente:
 * el trigger es la única fuente, igual que en el reto de lugar (evita el 42501 de RLS).
 *
 * La cifra NO viaja al cliente: el RETURNING usa `CHALLENGE_COLUMNS_NO_ANSWER`, que no
 * incluye `answer_number_src` (revocada) ni `answer_number` (vive en challenge_answers).
 */
export async function createNumberChallenge(
  input: NewNumberChallengeInput,
): Promise<{ challenge: ChallengeForPlay; groupId: string }> {
  const groupId = input.groupId
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      group_id: groupId,
      title: input.title,
      challenge_kind: 'number',
      number_question: input.question,
      number_unit: input.unit?.trim() ? input.unit.trim() : null,
      number_decimals: input.decimals ?? 0,
      number_tolerance: input.tolerance ?? DEFAULT_NUMBER_TOLERANCE,
      // La cifra correcta (SPOILER): entra por answer_number_src; el trigger la
      // copia a challenge_answers.answer_number. Nunca legible desde challenges.
      answer_number_src: input.answerNumber,
      image_path: input.imagePath ?? null,
      photo_is_hint: true,
      guess_seconds: input.guessSeconds ?? null,
      deadline_at: input.deadlineAt ?? deadlineFromNow(DEFAULT_DURATION_HOURS),
      created_by: input.createdBy,
    })
    // RETURNING sin la respuesta (answer_number_src revocada; answer_number vive en
    // challenge_answers). El trigger espeja la respuesta en la misma transacción.
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error
  return { challenge: data, groupId }
}

/**
 * Datos para crear un RECUERDO (momento SIN reto). A diferencia de un reto, NO
 * lleva respuesta oculta (no setea `lat`/`lng` → el trigger `sync_challenge_answer`
 * no escribe en `challenge_answers`), NI plazo, NI cronómetro. El lugar es VISIBLE
 * (`place_lat`/`place_lng`) y opcional: un recuerdo puede ser solo foto + texto. 0022.
 */
export interface NewMomentInput {
  title: string
  /** uuid del usuario de la sesión (`user.id`). Queda como `created_by` del momento. */
  createdBy: string
  /** Viaje (grupo) al que pertenece el momento. */
  groupId: string
  /** Descripción del día (texto libre); por defecto sin texto. */
  description?: string | null
  /**
   * Lugar VISIBLE del recuerdo en el mapa (no es spoiler; se sirve siempre).
   * Opcional: un recuerdo sin lugar es válido (solo aparece en el diario, no en la ruta).
   */
  placeLat?: number | null
  placeLng?: number | null
  /** Path en Storage de la imagen (foto opcional, sin EXIF). */
  imagePath?: string | null
  /** Panorama de Street View del lugar (opcional). */
  svPanoId?: string | null
  /** POV inicial del panorama: rumbo en grados. */
  svHeading?: number | null
  /** POV inicial del panorama: inclinación en grados. */
  svPitch?: number | null
}

/**
 * Crea un RECUERDO (momento sin reto): `is_challenge = false`, `deadline_at = null`,
 * sin respuesta oculta. El lugar (`place_lat`/`place_lng`) es visible y opcional. Es
 * la unidad mínima de compartir: una foto y/o un sitio y una descripción, sin juego.
 *
 * No tocamos `lat`/`lng`: dejarlas a null evita que el trigger `sync_challenge_answer`
 * (0022) cree fila en `challenge_answers` — un recuerdo no tiene respuesta que ocultar.
 * Promocionarlo a reto después (con `promoteToChallenge`) ya espejará la respuesta.
 */
export async function createMoment(
  input: NewMomentInput,
): Promise<{ challenge: ChallengeForPlay; groupId: string }> {
  const groupId = input.groupId
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      group_id: groupId,
      title: input.title,
      description: input.description ?? null,
      is_challenge: false,
      // Sin respuesta oculta: lat/lng se quedan sin setear (el trigger no espeja).
      place_lat: input.placeLat ?? null,
      place_lng: input.placeLng ?? null,
      image_path: input.imagePath ?? null,
      sv_pano_id: input.svPanoId ?? null,
      sv_heading: input.svHeading ?? null,
      sv_pitch: input.svPitch ?? null,
      // Un recuerdo no caduca: sin plazo ni cronómetro.
      deadline_at: null,
      created_by: input.createdBy,
    })
    // RETURNING sin lat/lng (columna revocada en 0010); place_lat/place_lng e
    // is_challenge SÍ vienen (no son spoiler).
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error
  return { challenge: data, groupId }
}

/**
 * Ajustes de la capa de RETO que se añade sobre un recuerdo existente. La respuesta
 * (`lat`/`lng`) es la coordenada OCULTA a adivinar: normalmente la del lugar del
 * recuerdo (`place_*`), o una ajustada por el creador. El resto es la mecánica de
 * juego (plazo, cronómetro, Street View y sus candados).
 */
export interface PromoteToChallengeInput {
  /** Respuesta oculta del reto (lo que hay que adivinar). El trigger la espeja a challenge_answers. */
  lat: number
  lng: number
  /** Plazo del reto en ISO absoluto; por defecto, 24 h desde ahora (duración relativa). */
  deadlineAt?: string
  /** Segundos por jugada; null = sin límite. */
  guessSeconds?: number | null
  /** Panorama de Street View encajado a la respuesta (opcional). */
  svPanoId?: string | null
  /** POV inicial del panorama: rumbo en grados. */
  svHeading?: number | null
  /** POV inicial del panorama: inclinación en grados. */
  svPitch?: number | null
  /** Candado de MOVIMIENTO del SV (true = bloqueado). Default false (permitido). #187. */
  svLockMove?: boolean
  /** Candado de GIRO del SV (true = bloqueado). Default false (permitido). #187. */
  svLockRotate?: boolean
  /** Si hay foto, ¿pista visible al jugar (true) o sorpresa hasta el revelado (false)? */
  photoIsHint?: boolean
  /** Precisión del reto (0028); por defecto 'mundo' = scoring histórico. */
  scoreScale?: ScoreScale
}

/**
 * Promociona un RECUERDO a RETO (un UPDATE, sin tabla nueva): `is_challenge = true`,
 * fija la respuesta oculta (`lat`/`lng`), el plazo, el cronómetro y los candados de
 * Street View. El trigger `sync_challenge_answer` (0022) espeja la respuesta a
 * `challenge_answers` al detectar que ahora hay lat/lng con `is_challenge = true`;
 * por eso NO escribimos `challenge_answers` desde el cliente (evita el 42501 de RLS).
 *
 * Solo el dueño del grupo lo consigue (RLS `challenges_update_owner`; la UI esconde
 * la acción a los miembros). Devuelve el momento ya como reto, sin la respuesta.
 */
export async function promoteToChallenge(
  challengeId: string,
  input: PromoteToChallengeInput,
): Promise<ChallengeForPlay> {
  const patch: ChallengeUpdate = {
    is_challenge: true,
    lat: input.lat,
    lng: input.lng,
    deadline_at: input.deadlineAt ?? deadlineFromNow(DEFAULT_DURATION_HOURS),
    guess_seconds: input.guessSeconds ?? null,
    sv_pano_id: input.svPanoId ?? null,
    sv_heading: input.svHeading ?? null,
    sv_pitch: input.svPitch ?? null,
    sv_lock_move: input.svLockMove ?? false,
    sv_lock_rotate: input.svLockRotate ?? false,
    // Precisión del scoring; 'mundo' (default) = comportamiento histórico (0028).
    score_scale: input.scoreScale ?? DEFAULT_SCORE_SCALE,
  }
  if (input.photoIsHint !== undefined) patch.photo_is_hint = input.photoIsHint

  const { data, error } = await supabase
    .from('challenges')
    .update(patch)
    .eq('id', challengeId)
    // RETURNING sin lat/lng (columna revocada en 0010): la respuesta la sincroniza
    // el trigger 0022, no la leemos aquí.
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error
  return data
}

/**
 * Lee un reto por su id PARA JUGAR, SIN la respuesta (lat/lng). El payload que
 * alimenta el mapa de adivinar no debe contener la ubicación real: se revela solo
 * al votar (RPC `submit_vote`) o al recargar un reto ya votado/cerrado (`getAnswer`).
 * Lanza si no existe o hay error de red.
 */
export async function getChallenge(id: string): Promise<ChallengeForPlay> {
  const { data, error } = await supabase
    .from('challenges')
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .eq('id', id)
    .single<ChallengeForPlay>()
  if (error) throw error
  return data
}

/**
 * Respuestas (lat/lng) de varios retos a la vez, indexadas por challenge_id. La RLS
 * de `challenge_answers` solo devuelve las que el solicitante puede ver (reto cerrado
 * o ya votado; el dueño, las suyas). La usa la página del grupo para pintar el pin de
 * la respuesta en los retos CERRADOS (sección "anteriores") sin un fetch por tarjeta.
 */
export async function getAnswers(challengeIds: string[]): Promise<Map<string, LatLng>> {
  if (challengeIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('challenge_answers')
    .select('challenge_id, lat, lng')
    .in('challenge_id', challengeIds)
  if (error) throw error
  // Solo respuestas de LUGAR (lat/lng presentes). Las de NÚMERO (0029) tienen lat/lng
  // null y no aportan pin en el mapa: se filtran. El estrechado de tipo deja LatLng.
  return new Map(
    (data ?? [])
      .filter(
        (a): a is { challenge_id: string; lat: number; lng: number } =>
          a.lat != null && a.lng != null,
      )
      .map((a) => [a.challenge_id, { lat: a.lat, lng: a.lng }]),
  )
}

/**
 * Respuesta (lat/lng) de un reto, o null si el usuario aún no tiene derecho a verla.
 * La RLS de `challenge_answers` (migración 0010) solo la sirve si el reto ya está
 * cerrado o si el usuario ya votó. Se usa al RECARGAR un reto ya jugado para volver
 * a pintar el pin de la respuesta (el revelado inmediato tras votar usa la RPC).
 * `maybeSingle`: "sin derecho / sin fila" no es un error, es null.
 */
export async function getAnswer(challengeId: string): Promise<LatLng | null> {
  const { data, error } = await supabase
    .from('challenge_answers')
    .select('lat, lng')
    .eq('challenge_id', challengeId)
    .maybeSingle()
  if (error) throw error
  // Solo respuesta de LUGAR: una de NÚMERO (0029) tiene lat/lng null → sin pin.
  return data && data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null
}

/**
 * Respuesta (cifra) de un reto de NÚMERO ("¿Cuánto?"), o null si el usuario aún no
 * tiene derecho a verla. HERMANA de `getAnswer`: la misma RLS de `challenge_answers`
 * (0010/0029) solo la sirve si el reto está cerrado o el usuario ya votó. Se usa al
 * RECARGAR un reto de número ya jugado para volver a pintar el revelado (el revelado
 * inmediato tras votar usa la RPC `submit_number_vote`). `maybeSingle`: sin derecho/
 * sin fila → null.
 */
export async function getNumberAnswer(challengeId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('challenge_answers')
    .select('answer_number')
    .eq('challenge_id', challengeId)
    .maybeSingle()
  if (error) throw error
  return data?.answer_number ?? null
}

/**
 * Nº de votos (jugadas) de un reto. Lo usa la edición para decidir si la
 * UBICACIÓN sigue siendo editable: con votos ya guardados, cambiar lat/lng
 * alteraría la respuesta y las distancias/puntos ya calculados (ver
 * `updateChallenge`). `head: true` + `count` no trae filas, solo el número.
 */
export async function countVotes(challengeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
  if (error) throw error
  return count ?? 0
}

/**
 * Campos editables de un reto. La UBICACIÓN (`lat`/`lng` + el panorama y POV de
 * Street View que la acompañan) es OPCIONAL a propósito: solo se permite cambiar
 * mientras el reto no tenga votos. El resto (título, foto, duración, tiempo por
 * jugada) se puede editar siempre.
 */
export interface UpdateChallengeInput {
  title?: string
  /** Descripción del día (texto libre); null o '' la deja vacía. Migración 0021. */
  description?: string | null
  /** Plazo del reto en ISO absoluto (duración relativa ya congelada). */
  deadlineAt?: string
  /** Segundos por jugada; null = sin límite. */
  guessSeconds?: number | null
  /** Path en Storage de la nueva foto (sin EXIF); null la quita. */
  imagePath?: string | null
  /** Si hay foto, pista visible al jugar (true) o sorpresa hasta el revelado (false). */
  photoIsHint?: boolean
  /**
   * Nueva ubicación + panorama. SOLO se aplica si el reto no tiene votos; si los
   * tiene, `updateChallenge` la ignora (y la UI bloquea el campo). Va junta porque
   * cambiar el punto sin recolocar el panorama dejaría el Street View incoherente.
   */
  location?: {
    lat: number
    lng: number
    svPanoId?: string
    svHeading?: number
    svPitch?: number
    /** Candado de MOVIMIENTO del SV (true = bloqueado). Default false (permitido). #187. */
    svLockMove?: boolean
    /** Candado de GIRO del SV (true = bloqueado). Default false (permitido). #187. */
    svLockRotate?: boolean
  }
}

/**
 * Edita un reto. Solo el dueño del grupo lo consigue (RLS `challenges_update_owner`
 * lo respalda; la UI esconde la acción a los miembros).
 *
 * REGLA DE INTEGRIDAD: la ubicación solo se puede cambiar mientras el reto NO
 * tenga votos. Con votos ya guardados, mover lat/lng cambiaría la respuesta y
 * dejaría inconsistentes las distancias/puntos ya calculados (no los recalculamos
 * a posteriori). Por eso comprobamos `countVotes` aquí, en la capa de datos, aunque
 * la UI ya bloquee el campo: la regla no debe depender solo del cliente.
 */
export async function updateChallenge(
  id: string,
  input: UpdateChallengeInput,
): Promise<ChallengeForPlay> {
  const patch: ChallengeUpdate = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.deadlineAt !== undefined) patch.deadline_at = input.deadlineAt
  if (input.guessSeconds !== undefined) patch.guess_seconds = input.guessSeconds
  if (input.imagePath !== undefined) patch.image_path = input.imagePath
  if (input.photoIsHint !== undefined) patch.photo_is_hint = input.photoIsHint

  if (input.location !== undefined) {
    const votes = await countVotes(id)
    if (votes > 0) {
      throw new Error('No se puede cambiar la ubicación de un reto que ya tiene jugadas.')
    }
    patch.lat = input.location.lat
    patch.lng = input.location.lng
    patch.sv_pano_id = input.location.svPanoId ?? null
    patch.sv_heading = input.location.svHeading ?? null
    patch.sv_pitch = input.location.svPitch ?? null
    patch.sv_lock_move = input.location.svLockMove ?? false
    patch.sv_lock_rotate = input.location.svLockRotate ?? false
  }

  const { data, error } = await supabase
    .from('challenges')
    .update(patch)
    .eq('id', id)
    // RETURNING sin lat/lng (columna revocada en 0010). Si cambió la ubicación, la
    // respuesta en `challenge_answers` la actualiza el TRIGGER `sync_challenge_answer`
    // (0012) al detectar el UPDATE de lat/lng — no la escribimos desde el cliente
    // (evita el 42501 de RLS y deja el trigger como única fuente).
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error

  return data
}

/**
 * Edita SOLO la descripción del día de un reto (texto editorial; no toca la
 * mecánica). Atajo de `updateChallenge` para la edición inline del detalle del
 * momento. Recorta espacios y guarda `null` si queda vacía (estado "sin texto").
 * Solo el dueño del grupo lo consigue (misma RLS `challenges_update_owner`, 0004).
 */
export async function updateChallengeDescription(id: string, description: string): Promise<void> {
  const trimmed = description.trim()
  const { error } = await supabase
    .from('challenges')
    .update({ description: trimmed === '' ? null : trimmed })
    .eq('id', id)
  if (error) throw error
}

/**
 * Campos editables de un RECUERDO (momento sin capa de reto). A diferencia de un
 * reto, el lugar de un recuerdo es VISIBLE (`place_lat`/`place_lng`) y se puede
 * cambiar SIEMPRE (no hay respuesta oculta ni votos que romper). La "fecha" del
 * momento es su `created_at` (no hay columna de fecha aparte: el diario ordena por
 * ahí), así que editarla mueve el momento en la línea de tiempo. Todos los campos
 * son opcionales: solo se aplican los presentes (patch parcial).
 */
export interface UpdateMomentInput {
  title?: string
  /** Descripción del día (texto libre); null o '' la deja vacía. */
  description?: string | null
  /**
   * Lugar VISIBLE del recuerdo. `null` lo quita del mapa (queda solo en el diario).
   * Va junto al panorama para no dejar un Street View incoherente con el sitio.
   */
  place?: {
    lat: number
    lng: number
    svPanoId?: string | null
    svHeading?: number | null
    svPitch?: number | null
  } | null
  /**
   * Fecha del momento en ISO (se guarda en `created_at`). Mueve el momento en la
   * línea de tiempo del diario, que ordena por `created_at`.
   */
  createdAt?: string
}

/**
 * Edita un RECUERDO (título, descripción, lugar visible y/o fecha). Solo el dueño
 * del grupo lo consigue (RLS `challenges_update_owner`; la UI esconde la acción a
 * los miembros). Devuelve el momento actualizado, sin la respuesta oculta.
 *
 * No toca la capa de reto (plazo, cronómetro, candados): para eso está
 * `updateChallenge`. Aquí el lugar es VISIBLE, así que cambiarlo escribe
 * `place_lat`/`place_lng` (no `lat`/`lng`: un recuerdo no tiene respuesta a ocultar).
 */
export async function updateMoment(
  id: string,
  input: UpdateMomentInput,
): Promise<ChallengeForPlay> {
  const patch: ChallengeUpdate = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.description !== undefined) {
    const trimmed = input.description?.trim() ?? ''
    patch.description = trimmed === '' ? null : trimmed
  }
  if (input.createdAt !== undefined) patch.created_at = input.createdAt
  if (input.place !== undefined) {
    if (input.place === null) {
      // Quitar el lugar: fuera del mapa y sin panorama colgando.
      patch.place_lat = null
      patch.place_lng = null
      patch.sv_pano_id = null
      patch.sv_heading = null
      patch.sv_pitch = null
    } else {
      patch.place_lat = input.place.lat
      patch.place_lng = input.place.lng
      patch.sv_pano_id = input.place.svPanoId ?? null
      patch.sv_heading = input.place.svHeading ?? null
      patch.sv_pitch = input.place.svPitch ?? null
    }
  }

  const { data, error } = await supabase
    .from('challenges')
    .update(patch)
    .eq('id', id)
    .select(CHALLENGE_COLUMNS_NO_ANSWER)
    .single<ChallengeForPlay>()
  if (error) throw error
  return data
}

/**
 * Borra un reto. Solo el dueño del grupo lo consigue (RLS lo respalda; la UI
 * además esconde la acción a los miembros). Lanza si Supabase devuelve error.
 */
export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw error
}
