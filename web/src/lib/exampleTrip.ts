// Viaje de EJEMPLO: solo lectura, en memoria, sin Supabase (onboarding nuevo,
// pieza 4/4). Sirve dos entradas — "Ver un viaje de ejemplo" del perfil (marco
// "Ejemplo") y, más adelante, cualquier otra que quiera un viaje curado sin
// tocar red — con un `groupId` CENTINELA (`EXAMPLE_TRIP_GROUP_ID`) que
// `useTripData` intercepta ANTES de llamar a Supabase (ver el comentario en
// ese fichero): nunca hay una fila real `groups.id = 'ejemplo'` en la base de
// datos, así que esto no puede chocar con un viaje real de nadie.
//
// Por qué aquí y no en `features/trip/`: `lib/route.ts` (la capa de rutas)
// necesita el mismo id para construir el enlace `#g=ejemplo&tour=1` sin
// depender de `features/**` (lib/ no debe depender de features/, al revés
// sí) — este fichero es lib/ puro (datos), igual que `gallery/fixtures.ts` es
// el equivalente para el modo galería (dev-only, NO se reutiliza aquí: este
// viaje vive en producción real, servido desde el propio bundle).
//
// Contenido curado: 4 momentos con fotos reales (evocadoras, no genéricas) —
// un recuerdo (Lisboa) + dos retos CERRADOS con resultado (Roma, Tokio) + uno
// ABIERTO (Ciudad del Cabo, cuenta atrás viva) — y una liga con tres jugadores.
// Los cerrados usan los dos TIPOS de reto reales (lugar y número, `challenge_kind`
// en `lib/challenges.ts`), para que la guía pueda decir "así se juega uno" de
// cualquiera de los dos sin inventar una mecánica que no exista en la app.

import type { GroupInfo } from './groupData'
import type { ChallengeForPlay } from './challenges'
import type { Vote } from './database.types'
import type { VoteWithName } from './leaderboard'
import type { LatLng } from './geo'
import type { CountryInfo } from './countryFlag'

/** Id CENTINELA del viaje de ejemplo: nunca existe como fila real en `groups`. */
export const EXAMPLE_TRIP_GROUP_ID = 'ejemplo'

/** Subtítulo fijo del viaje de ejemplo (equivalente a la línea "Tú, X y N más"
 * de un viaje real): sin sesión propia dentro de este viaje curado, listamos
 * a su gente tal cual, sin "Tú" (quien lo mira no es miembro). */
export const EXAMPLE_TRIP_SUBTITLE = 'Lucía, Marta, Iker y Noa'

const EXAMPLE_USER_LUCIA = 'ejemplo-lucia'
const EXAMPLE_USER_MARTA = 'ejemplo-marta'
const EXAMPLE_USER_IKER = 'ejemplo-iker'
const EXAMPLE_USER_NOA = 'ejemplo-noa'

export const EXAMPLE_MOMENT_LISBOA = 'ejemplo-momento-lisboa'
export const EXAMPLE_CHALLENGE_ROMA = 'ejemplo-reto-roma'
export const EXAMPLE_CHALLENGE_TOKIO = 'ejemplo-reto-tokio'
export const EXAMPLE_CHALLENGE_CIUDAD_DEL_CABO = 'ejemplo-reto-ciudad-del-cabo'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
}
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}
function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * HOUR_MS).toISOString()
}

/** Fila de grupo del viaje de ejemplo. Abierto (`closed_at: null`): un viaje
 * cerrado ofrecería el recap de cierre, ruido que no aporta a la guía. */
function exampleGroup(): GroupInfo {
  return {
    id: EXAMPLE_TRIP_GROUP_ID,
    name: 'Vuelta al mundo',
    prizes: null,
    closed_at: null,
    starts_on: daysAgoDate(7),
    ends_on: daysAgoDate(0),
    description: 'Un vistazo rápido a cómo se ve un viaje entero en Momentu.',
    companions: EXAMPLE_TRIP_SUBTITLE,
    cover_image_path: null,
  }
}

// Base común de un reto/recuerdo curado: valores por defecto realistas
// (mismo patrón que `baseChallenge` de `gallery/fixtures.ts`, sin reutilizarlo
// — ese fichero es dev-only). `video_path` va siempre a null: `ChallengeForPlay`
// lo exige en el tipo (Omit<Challenge, 'lat'|'lng'> conserva el resto de
// columnas) aunque ningún momento de este viaje lleve clip.
function baseMoment(
  over: Partial<ChallengeForPlay> & Pick<ChallengeForPlay, 'id' | 'title' | 'image_path'>,
): ChallengeForPlay {
  return {
    group_id: EXAMPLE_TRIP_GROUP_ID,
    description: null,
    is_challenge: true,
    place_lat: null,
    place_lng: null,
    audio_path: null,
    video_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    sv_lock_move: false,
    sv_lock_rotate: false,
    guess_seconds: 30,
    deadline_at: null,
    photo_is_hint: true,
    score_scale: 'mundo',
    challenge_kind: 'location',
    number_question: null,
    number_unit: null,
    number_decimals: 0,
    number_tolerance: 'normal',
    time_scoring: true,
    happened_on: null,
    created_by: EXAMPLE_USER_LUCIA,
    created_at: daysAgoIso(7),
    ...over,
  }
}

function exampleChallenges(): ChallengeForPlay[] {
  return [
    // RECUERDO (sin reto): la primera parada, sienta el Diario. Sin ella el
    // viaje empezaría directo en un reto, sin "esto también es un diario".
    baseMoment({
      id: EXAMPLE_MOMENT_LISBOA,
      title: 'Miradouro da Graça',
      description: 'La primera vista del viaje, con toda Lisboa a los pies.',
      image_path: '/example-trip/lisboa.webp',
      is_challenge: false,
      place_lat: 38.7167,
      place_lng: -9.1332,
      created_by: EXAMPLE_USER_LUCIA,
      created_at: daysAgoIso(7),
      happened_on: daysAgoDate(7),
    }),
    // RETO CERRADO de LUGAR: ganó Marta.
    baseMoment({
      id: EXAMPLE_CHALLENGE_ROMA,
      title: '¿Dónde tomamos este café?',
      description: 'Una terraza cualquiera de Roma, con la mañana recién empezada.',
      image_path: '/example-trip/roma.webp',
      challenge_kind: 'location',
      created_by: EXAMPLE_USER_LUCIA,
      created_at: daysAgoIso(5),
      happened_on: daysAgoDate(5),
      deadline_at: daysAgoIso(4),
    }),
    // RETO CERRADO de NÚMERO: ganó Iker.
    baseMoment({
      id: EXAMPLE_CHALLENGE_TOKIO,
      title: '¿Cuántos escalones tiene este templo?',
      description: 'Subida entera hasta arriba, contando cada peldaño.',
      image_path: '/example-trip/tokio.webp',
      challenge_kind: 'number',
      number_question: '¿Cuántos escalones hay hasta arriba?',
      number_unit: 'escalones',
      number_decimals: 0,
      number_tolerance: 'normal',
      created_by: EXAMPLE_USER_MARTA,
      created_at: daysAgoIso(3),
      happened_on: daysAgoDate(3),
      deadline_at: daysAgoIso(2),
    }),
    // RETO ABIERTO (cuenta atrás viva): el último momento, todavía en juego —
    // por eso NO tiene entrada en `exampleAnswers` (anti-spoiler, igual regla
    // que un reto real: la respuesta de un activo nunca se sirve).
    baseMoment({
      id: EXAMPLE_CHALLENGE_CIUDAD_DEL_CABO,
      title: '¿Dónde estamos ahora?',
      description: 'El último sitio del viaje. Aún se puede jugar.',
      image_path: '/example-trip/ciudad-del-cabo.webp',
      challenge_kind: 'location',
      created_by: EXAMPLE_USER_NOA,
      created_at: daysAgoIso(0),
      happened_on: daysAgoDate(0),
      deadline_at: hoursFromNowIso(18),
    }),
  ]
}

/** Respuestas (lat/lng) de los retos CERRADOS de lugar — el reto de número
 * (Tokio) no lleva coordenada (su respuesta es una cifra, no un punto) y el
 * abierto (Ciudad del Cabo) tampoco, a propósito (anti-spoiler). */
function exampleAnswers(): Map<string, LatLng> {
  return new Map([[EXAMPLE_CHALLENGE_ROMA, { lat: 41.8992, lng: 12.4731 }]])
}

function vote(
  over: Partial<Vote> & Pick<Vote, 'id' | 'challenge_id' | 'user_id' | 'points'>,
): Vote {
  return {
    group_id: EXAMPLE_TRIP_GROUP_ID,
    guess_lat: null,
    guess_lng: null,
    distance_km: null,
    guess_number: null,
    abs_error: null,
    left_app: false,
    elapsed_seconds: 14,
    play_started_at: null,
    created_at: daysAgoIso(4),
    ...over,
  }
}

// Nombre/avatar por jugador: `avatar: null` cae al animal por defecto que
// deriva `Avatar` del propio userId (mismo criterio que `gallery/fixtures.ts`).
const PLAYER_BY_ID: Record<string, { name: string; avatar: string | null }> = {
  [EXAMPLE_USER_LUCIA]: { name: 'Lucía', avatar: null },
  [EXAMPLE_USER_MARTA]: { name: 'Marta', avatar: null },
  [EXAMPLE_USER_IKER]: { name: 'Iker', avatar: null },
  [EXAMPLE_USER_NOA]: { name: 'Noa', avatar: null },
}

function exampleVotes(): VoteWithName[] {
  const rows: Vote[] = [
    // Reto de Roma (lugar): ganó Marta, muy cerca; Lucía creó el reto y no vota
    // el suyo (misma regla que un reto real — el creador no puede jugar el propio).
    vote({
      id: 'ejemplo-voto-roma-marta',
      challenge_id: EXAMPLE_CHALLENGE_ROMA,
      user_id: EXAMPLE_USER_MARTA,
      points: 4820,
      guess_lat: 41.8985,
      guess_lng: 12.4736,
      distance_km: 0.3,
      elapsed_seconds: 11,
    }),
    vote({
      id: 'ejemplo-voto-roma-iker',
      challenge_id: EXAMPLE_CHALLENGE_ROMA,
      user_id: EXAMPLE_USER_IKER,
      points: 3610,
      guess_lat: 41.912,
      guess_lng: 12.48,
      distance_km: 1.8,
      elapsed_seconds: 19,
    }),
    vote({
      id: 'ejemplo-voto-roma-noa',
      challenge_id: EXAMPLE_CHALLENGE_ROMA,
      user_id: EXAMPLE_USER_NOA,
      points: 2005,
      guess_lat: 41.94,
      guess_lng: 12.45,
      distance_km: 4.2,
      elapsed_seconds: 24,
    }),
    // Reto de Tokio (número): ganó Iker, el más cercano a la cifra real.
    vote({
      id: 'ejemplo-voto-tokio-iker',
      challenge_id: EXAMPLE_CHALLENGE_TOKIO,
      user_id: EXAMPLE_USER_IKER,
      points: 4700,
      guess_number: 275,
      abs_error: 10,
      elapsed_seconds: 9,
      created_at: daysAgoIso(2),
    }),
    vote({
      id: 'ejemplo-voto-tokio-lucia',
      challenge_id: EXAMPLE_CHALLENGE_TOKIO,
      user_id: EXAMPLE_USER_LUCIA,
      points: 3050,
      guess_number: 230,
      abs_error: 55,
      elapsed_seconds: 16,
      created_at: daysAgoIso(2),
    }),
    vote({
      id: 'ejemplo-voto-tokio-noa',
      challenge_id: EXAMPLE_CHALLENGE_TOKIO,
      user_id: EXAMPLE_USER_NOA,
      points: 1800,
      guess_number: 190,
      abs_error: 95,
      elapsed_seconds: 22,
      created_at: daysAgoIso(2),
    }),
  ]
  return rows.map((v) => ({
    ...v,
    display_name: PLAYER_BY_ID[v.user_id]?.name ?? '—',
    avatar: PLAYER_BY_ID[v.user_id]?.avatar ?? null,
  }))
}

/** Snapshot completo del viaje de ejemplo, en la MISMA forma que la última
 * respuesta buena de `useTripData` (grupo + retos-sin-respuesta + votos +
 * respuestas + fotos ya "firmadas"): sirve para sembrar su estado inicial sin
 * pasar por ningún `useState`/efecto de red. Las "URLs firmadas" aquí son
 * simplemente las rutas públicas de `/public/example-trip/*` — no hay bucket
 * privado que firmar, así que `imageUrlById` es un espejo directo de
 * `image_path` por cada momento con foto (los 4 la llevan).
 */
export function getExampleTripSnapshot(): {
  group: GroupInfo
  challenges: ChallengeForPlay[]
  votes: VoteWithName[]
  answersById: Map<string, LatLng>
  imageUrlById: Record<string, string>
  audioUrlById: Record<string, string>
  videoUrlById: Record<string, string>
} {
  const challenges = exampleChallenges()
  const imageUrlById = Object.fromEntries(
    challenges.filter((c) => c.image_path).map((c) => [c.id, c.image_path as string]),
  )
  return {
    group: exampleGroup(),
    challenges,
    votes: exampleVotes(),
    answersById: exampleAnswers(),
    imageUrlById,
    audioUrlById: {},
    videoUrlById: {},
  }
}

/** País por momento (bandera + nombre, estilo Polarsteps): fijo, sin pasar por
 * Nominatim — el reto ABIERTO (Ciudad del Cabo) no entra a propósito (su
 * coordenada no existe todavía, anti-spoiler; ver `exampleAnswers`). */
export function getExampleTripCountryById(): Record<string, CountryInfo | null> {
  return {
    // El emoji es el DATO `CountryInfo.flag` (mismo shape que devuelve
    // `flagFromCountryCode` en `lib/countryFlag.ts`), no un emoji pintado a mano
    // en la UI — se sirve tal cual, igual que un país resuelto por Nominatim.
    [EXAMPLE_MOMENT_LISBOA]: { code: 'PT', name: 'PORTUGAL', flag: '🇵🇹' }, // design-lint-allow: dato CountryInfo.flag, no UI
    [EXAMPLE_CHALLENGE_ROMA]: { code: 'IT', name: 'ITALIA', flag: '🇮🇹' }, // design-lint-allow: dato CountryInfo.flag, no UI
    [EXAMPLE_CHALLENGE_TOKIO]: { code: 'JP', name: 'JAPÓN', flag: '🇯🇵' }, // design-lint-allow: dato CountryInfo.flag, no UI
  }
}
