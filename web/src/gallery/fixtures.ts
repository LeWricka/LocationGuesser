// Datos sembrados, FIJOS y deterministas para la galería (sin login ni red). Un
// único "mundo" de prueba: un viaje con varios momentos (recuerdo, reto en juego,
// retos cerrados, reto de número), varios miembros y sus votos. Las pantallas
// reales leen esto a través del cliente Supabase falso (fakeSupabase.ts), así que
// no hay que tocar nada de features/**.
//
// Por qué fijo: el objetivo es la CAPTURA determinista (mismos píxeles en cada
// corrida). No usamos Date.now() ni datos aleatorios: el "ahora" de la galería es
// GALLERY_NOW y los plazos se calculan relativos a él.

import type { Challenge, GroupPrizes, Profile, Vote } from '../lib/database.types'

// Mundo VACÍO: algunos casos (home recién llegada) necesitan que "mis grupos" no
// devuelva nada. Es un flag de módulo que el cliente falso consulta antes de servir
// group_members; lo activa el caso correspondiente ANTES de montar la pantalla.
let emptyWorld = false
export function setEmptyWorld(value: boolean): void {
  emptyWorld = value
}
export function isEmptyWorld(): boolean {
  return emptyWorld
}

// "Ahora" congelado de la galería. Todas las fechas relativas (plazos, "hace X")
// se derivan de aquí para que la cuenta atrás y los "hace N días" no cambien entre
// capturas. El runtime también congela Date a este instante (ver freezeTime).
export const GALLERY_NOW = new Date('2026-06-15T10:00:00.000Z')

function isoFromNow(deltaMs: number): string {
  return new Date(GALLERY_NOW.getTime() + deltaMs).toISOString()
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ── Identidad "yo" (la sesión simulada) y compañeros de viaje ────────────────
export const ME_ID = 'user-lewis-0000'
export const GROUP_ID = 'viaje-japon'

export const ME: Profile = {
  id: ME_ID,
  display_name: 'Lewis',
  avatar_url: null,
  created_at: isoFromNow(-30 * DAY),
}

interface GalleryMember {
  userId: string
  name: string
  avatar: string | null
  role: 'owner' | 'member'
}

export const MEMBERS: GalleryMember[] = [
  { userId: ME_ID, name: 'Lewis', avatar: null, role: 'owner' },
  { userId: 'user-marta-0001', name: 'Marta', avatar: null, role: 'member' },
  { userId: 'user-iker-0002', name: 'Iker', avatar: null, role: 'member' },
  { userId: 'user-noa-0003', name: 'Noa', avatar: null, role: 'member' },
]

export const PROFILES: Profile[] = MEMBERS.map((m) => ({
  id: m.userId,
  display_name: m.name,
  avatar_url: m.avatar,
  created_at: isoFromNow(-30 * DAY),
}))

// ── El viaje (grupo) ──────────────────────────────────────────────────────────
const PRIZES: GroupPrizes = {
  first: 'Elige el próximo destino',
  last: 'Invita a las cañas',
}

export interface GalleryGroupRow {
  id: string
  name: string | null
  prizes: GroupPrizes | null
  created_by: string | null
  created_at: string
  closed_at: string | null
  starts_on: string | null
  ends_on: string | null
  description: string | null
  companions: string | null
  cover_image_path: string | null
}

export const GROUP: GalleryGroupRow = {
  id: GROUP_ID,
  name: 'Japón en primavera',
  prizes: PRIZES,
  created_by: ME_ID,
  created_at: isoFromNow(-12 * DAY),
  closed_at: null,
  starts_on: '2026-06-04',
  ends_on: '2026-06-18',
  description: 'Dos semanas entre templos, ramen y trenes bala.',
  companions: 'Marta, Iker y Noa',
  cover_image_path: 'cover-japon.jpg',
}

// ── Retos / momentos del viaje ────────────────────────────────────────────────
// Un reto vive en `challenges`. ChallengeForPlay = Omit<Challenge, 'lat' | 'lng'>,
// pero la fila completa lleva lat/lng (la respuesta oculta); el cliente falso ya
// las recorta al servir CHALLENGE_COLUMNS_NO_ANSWER, igual que PostgREST en prod.
type ChallengeRow = Challenge

function baseChallenge(
  over: Partial<ChallengeRow> & Pick<ChallengeRow, 'id' | 'title'>,
): ChallengeRow {
  return {
    group_id: GROUP_ID,
    description: null,
    is_challenge: true,
    lat: 35.0116,
    lng: 135.7681,
    place_lat: null,
    place_lng: null,
    image_path: null,
    audio_path: null,
    video_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    guess_seconds: 30,
    deadline_at: null,
    photo_is_hint: true,
    sv_lock_move: false,
    sv_lock_rotate: false,
    score_scale: 'mundo',
    challenge_kind: 'location',
    number_question: null,
    number_unit: null,
    number_decimals: 0,
    number_tolerance: 'normal',
    time_scoring: true,
    happened_on: null,
    created_by: ME_ID,
    created_at: isoFromNow(-5 * DAY),
    ...over,
  }
}

// Reto EN JUEGO (deadline futura): el que toca jugar.
export const CH_ACTIVE = 'ch-active-fushimi'
// Reto CERRADO de lugar, PROPIO (created_by = ME_ID): SOLO para demostrar
// "editar reto" y la guarda "es tuyo" (#579) — nadie vota su propio reto, así
// que este fixture NO lleva ningún voto de ME_ID (ver VOTES más abajo).
export const CH_CLOSED = 'ch-closed-arashiyama'
// Reto CERRADO de lugar, AJENO (created_by de OTRO miembro) con tu voto: el
// estado real y jugable en prod para "ya jugué esto, cerrado" (#579). Antes
// `detalle-reto-cerrado` usaba CH_CLOSED (propio + auto-voto imposible), lo que
// disparaba la guarda "es tuyo" en vez del revelado real — separado aquí.
export const CH_CLOSED_OTHER = 'ch-closed-kinkakuji'
// Recuerdo puro (sin juego): foto + lugar visible, sin plazo. Lleva galería
// multi-foto (MOMENT_IMAGES, más abajo) + nota de voz — caso rico de la
// Bitácora (issue de "Bitácora": kicker + título + descripción con capitular +
// nota de voz inline + TODAS sus fotos a ancho completo).
export const CH_MEMORY = 'ch-memory-ramen'
// Recuerdo SIN descripción (caso de galería `viaje-bitacora`): la Bitácora no
// debe dejar un hueco raro donde iría el cuerpo de artículo si el dueño aún no
// ha escrito nada — solo kicker + título + su única foto.
export const CH_MEMORY_QUIET = 'ch-memory-togetsukyo'
// Reto de NÚMERO cerrado: ¿cuánto costó?
export const CH_NUMBER = 'ch-number-shinkansen'
// Reto EN JUEGO con foto SORPRESA (`photo_is_hint: false`): la pestaña
// Bitácora (issue #645, antes "Fotos") NO debe enseñar su foto mientras siga
// en juego — caso de vigilancia visual del filtro anti-spoiler
// (`isMomentPhotoVisible`).
export const CH_ACTIVE_SORPRESA = 'ch-active-sorpresa-dotombori'

export const CHALLENGES: ChallengeRow[] = [
  baseChallenge({
    id: CH_ACTIVE,
    title: '¿Dónde tomó Marta esta foto?',
    description: 'Mil torii naranjas subiendo la montaña.',
    image_path: 'photo-fushimi.jpg',
    place_lat: null,
    place_lng: null,
    lat: 34.9671,
    lng: 135.7727,
    deadline_at: isoFromNow(14 * HOUR),
    created_by: 'user-marta-0001',
    created_at: isoFromNow(-10 * HOUR),
    guess_seconds: 30,
  }),
  baseChallenge({
    id: CH_CLOSED,
    title: 'El bosque de bambú',
    description: 'Caminamos al amanecer para encontrarlo vacío.',
    image_path: 'photo-arashiyama.jpg',
    place_lat: 35.0095,
    place_lng: 135.6716,
    lat: 35.0095,
    lng: 135.6716,
    deadline_at: isoFromNow(-2 * DAY),
    created_by: ME_ID,
    created_at: isoFromNow(-3 * DAY),
  }),
  // Reto cerrado AJENO con tu voto (#579): lo creó Marta, TÚ (ME_ID) jugaste y
  // votaste — el estado real que enseña `detalle-reto-cerrado` (mapa + resultado
  // revelados), no la guarda "es tuyo".
  baseChallenge({
    id: CH_CLOSED_OTHER,
    title: 'El Pabellón Dorado',
    description: 'Se refleja entero en el estanque si no hay viento.',
    image_path: 'photo-kinkakuji.jpg',
    place_lat: 35.0394,
    place_lng: 135.7292,
    lat: 35.0394,
    lng: 135.7292,
    deadline_at: isoFromNow(-1 * DAY),
    created_by: 'user-marta-0001',
    created_at: isoFromNow(-2 * DAY),
  }),
  baseChallenge({
    id: CH_NUMBER,
    title: '¿Cuánto costó el billete de tren bala?',
    challenge_kind: 'number',
    number_question: '¿Cuánto costó el billete de Tokio a Kioto?',
    number_unit: '€',
    number_decimals: 0,
    number_tolerance: 'normal',
    image_path: 'photo-shinkansen.jpg',
    deadline_at: isoFromNow(-1 * DAY),
    created_by: 'user-iker-0002',
    created_at: isoFromNow(-1 * DAY - 6 * HOUR),
    guess_seconds: 20,
  }),
  baseChallenge({
    id: CH_MEMORY,
    title: 'El mejor ramen del viaje',
    description: 'Una barra de ocho asientos perdida en un callejón.',
    is_challenge: false,
    image_path: 'photo-ramen.jpg',
    // Nota de voz (issue #648, caso de galería `viaje-bitacora`): el fake
    // storage la resuelve a un WAV silencioso válido (ver `fakeSupabase.ts`),
    // no a la imagen-etiqueta de `photoDataUri` — decodifica sin error.
    audio_path: 'audio/nota-ramen.webm',
    place_lat: 35.0036,
    place_lng: 135.7788,
    lat: 35.0036,
    lng: 135.7788,
    deadline_at: null,
    created_by: 'user-noa-0003',
    created_at: isoFromNow(-4 * DAY),
  }),
  // Recuerdo SIN descripción (caso de galería `viaje-bitacora`): una foto
  // suelta, sin galería extra ni voz — la Bitácora debe verse completa igual
  // (kicker + título, sin hueco de artículo vacío).
  baseChallenge({
    id: CH_MEMORY_QUIET,
    title: 'El puente Togetsukyo al atardecer',
    is_challenge: false,
    image_path: 'photo-togetsukyo.jpg',
    place_lat: 35.0094,
    place_lng: 135.6779,
    lat: 35.0094,
    lng: 135.6779,
    deadline_at: null,
    created_by: 'user-marta-0001',
    created_at: isoFromNow(-4 * DAY + HOUR),
  }),
  // Reto EN JUEGO con foto SORPRESA: `photo_is_hint: false` + `deadline_at`
  // futuro. La pestaña Fotos debe OCULTAR esta foto (issue #645) — no debe
  // aparecer ninguna tarjeta "Dotonbori" en el caso de galería `viaje-fotos`.
  baseChallenge({
    id: CH_ACTIVE_SORPRESA,
    title: '¿Dónde cenamos anoche?',
    image_path: 'photo-dotombori.jpg',
    photo_is_hint: false,
    place_lat: null,
    place_lng: null,
    lat: 34.6687,
    lng: 135.5013,
    deadline_at: isoFromNow(20 * HOUR),
    created_by: ME_ID,
    created_at: isoFromNow(-2 * HOUR),
  }),
]

// Respuestas (lat/lng) de los retos CERRADOS: solo se sirven para los cerrados
// (anti-spoiler), igual que la RLS de challenge_answers en prod.
export const ANSWERS: Record<string, { lat: number; lng: number }> = {
  [CH_CLOSED]: { lat: 35.0095, lng: 135.6716 },
  [CH_CLOSED_OTHER]: { lat: 35.0394, lng: 135.7292 },
}
export const NUMBER_ANSWERS: Record<string, number> = {
  [CH_NUMBER]: 285,
}

// ── Votos: alimentan clasificación, resultados y "guessedCount" ──────────────
function vote(
  over: Partial<Vote> & Pick<Vote, 'id' | 'challenge_id' | 'user_id' | 'points'>,
): Vote {
  return {
    group_id: GROUP_ID,
    guess_lat: null,
    guess_lng: null,
    distance_km: null,
    guess_number: null,
    abs_error: null,
    left_app: false,
    elapsed_seconds: 18,
    play_started_at: null,
    created_at: isoFromNow(-2 * DAY + HOUR),
    ...over,
  }
}

export const VOTES: Vote[] = [
  // Reto cerrado PROPIO (CH_CLOSED, creado por ME_ID): solo para "editar reto"
  // (el conteo de votos bloquea ciertos campos). Nadie vota su propio reto, así
  // que estos tres votos son de otros miembros (#579) — antes uno era de ME_ID,
  // un estado imposible en prod.
  vote({
    id: 'v1',
    challenge_id: CH_CLOSED,
    user_id: 'user-iker-0002',
    points: 4200,
    distance_km: 8,
    guess_lat: 35.02,
    guess_lng: 135.69,
  }),
  vote({
    id: 'v2',
    challenge_id: CH_CLOSED,
    user_id: 'user-marta-0001',
    points: 4880,
    distance_km: 1.2,
    guess_lat: 35.01,
    guess_lng: 135.67,
  }),
  vote({
    id: 'v3',
    challenge_id: CH_CLOSED,
    user_id: 'user-noa-0003',
    points: 3100,
    distance_km: 42,
    guess_lat: 35.3,
    guess_lng: 135.5,
  }),
  // Reto cerrado AJENO (CH_CLOSED_OTHER, creado por Marta) CON tu voto: el
  // estado real de "detalle-reto-cerrado" (#579) — TÚ (ME_ID) jugaste y
  // quedaste 2º de 3, con el revelado real (mapa + resultado), no la guarda.
  vote({
    id: 'v7',
    challenge_id: CH_CLOSED_OTHER,
    user_id: ME_ID,
    points: 4200,
    distance_km: 8,
    guess_lat: 35.05,
    guess_lng: 135.7,
  }),
  vote({
    id: 'v8',
    challenge_id: CH_CLOSED_OTHER,
    user_id: 'user-noa-0003',
    points: 4880,
    distance_km: 1.2,
    guess_lat: 35.04,
    guess_lng: 135.73,
  }),
  vote({
    id: 'v9',
    challenge_id: CH_CLOSED_OTHER,
    user_id: 'user-iker-0002',
    points: 3100,
    distance_km: 42,
    guess_lat: 34.9,
    guess_lng: 135.9,
  }),
  // Reto de número cerrado.
  vote({
    id: 'v4',
    challenge_id: CH_NUMBER,
    user_id: ME_ID,
    points: 4600,
    guess_number: 300,
    abs_error: 15,
  }),
  vote({
    id: 'v5',
    challenge_id: CH_NUMBER,
    user_id: 'user-iker-0002',
    points: 5000,
    guess_number: 285,
    abs_error: 0,
  }),
  vote({
    id: 'v6',
    challenge_id: CH_NUMBER,
    user_id: 'user-marta-0001',
    points: 2400,
    guess_number: 180,
    abs_error: 105,
  }),
]

// Nombre/avatar por usuario, para componer VoteWithName sin segunda consulta.
export const NAME_BY_USER = new Map(
  MEMBERS.map((m) => [m.userId, { name: m.name, avatar: m.avatar }]),
)

// Fotos: el cliente falso firma cada image_path a un data-URI SVG con el título,
// así no hay red ni bucket. Mapa path → etiqueta visible de la foto.
export const PHOTO_LABELS: Record<string, string> = {
  'cover-japon.jpg': 'Kioto',
  'photo-fushimi.jpg': 'Fushimi Inari',
  'photo-arashiyama.jpg': 'Arashiyama',
  'photo-kinkakuji.jpg': 'Kinkaku-ji',
  'photo-shinkansen.jpg': 'Shinkansen',
  'photo-ramen.jpg': 'Ramen',
  'photo-ramen-2.jpg': 'La barra',
  'photo-ramen-3.jpg': 'El caldo',
  'photo-dotombori.jpg': 'Dotonbori (sorpresa oculta)',
  'photo-togetsukyo.jpg': 'Puente Togetsukyo',
}

// Galería del recuerdo del ramen: varias fotos ordenadas por sort_order (la de 0
// es la portada). Sirve para capturar MomentGallery con controles de dueño.
export interface MomentImageRow {
  id: string
  challenge_id: string
  image_path: string
  sort_order: number
  created_at: string
}
export const MOMENT_IMAGES: MomentImageRow[] = [
  {
    id: 'mi-ramen-1',
    challenge_id: CH_MEMORY,
    image_path: 'photo-ramen.jpg',
    sort_order: 0,
    created_at: isoFromNow(-4 * DAY),
  },
  {
    id: 'mi-ramen-2',
    challenge_id: CH_MEMORY,
    image_path: 'photo-ramen-2.jpg',
    sort_order: 1,
    created_at: isoFromNow(-4 * DAY),
  },
  {
    id: 'mi-ramen-3',
    challenge_id: CH_MEMORY,
    image_path: 'photo-ramen-3.jpg',
    sort_order: 2,
    created_at: isoFromNow(-4 * DAY),
  },
]
