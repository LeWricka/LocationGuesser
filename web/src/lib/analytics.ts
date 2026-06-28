// Analítica (Mixpanel) — punto ÚNICO de acceso. Otras features importan `track`
// y los nombres de evento desde aquí; nada de strings sueltos ni del SDK directo
// fuera de esta lib. El token es público (como la publishable key de Supabase),
// con fallback embebido para que funcione sin configurar env en local.
//
// Idempotente y a prueba de "no inicializado": todo lo público pasa por el guard
// `enabled`, así llamar a track/identify antes de init (o en tests) es un no-op
// seguro en vez de petar.

import mixpanel from 'mixpanel-browser'

// Token público de Mixpanel (proyecto EU). Va en el bundle del cliente por
// diseño; el env permite sobreescribirlo por entorno sin tocar código.
const FALLBACK_TOKEN = '804a0a0fe0da2496051217c66bd0ff83'

const token = import.meta.env.VITE_MIXPANEL_TOKEN ?? FALLBACK_TOKEN

// Apagamos la analítica cuando: no hay token, estamos en tests (unit/E2E no deben
// mandar eventos) o el entorno lo desactiva explícitamente (VITE_ANALYTICS_DISABLED).
const disabledByEnv = import.meta.env.VITE_ANALYTICS_DISABLED === 'true'
const isTest = import.meta.env.MODE === 'test'

// Estado de inicialización: solo arrancamos una vez y solo entonces `track` etc.
// hacen algo real.
let enabled = false

// ── Catálogo de eventos ──────────────────────────────────────────────────────
// Nombres en snake_case. Tipar la unión obliga a usar nombres válidos en todo el
// código; añadir un evento nuevo = añadirlo aquí.
export type AnalyticsEvent =
  | 'signup_completed'
  | 'login'
  | 'group_created'
  | 'group_joined'
  | 'challenge_created'
  | 'challenge_played'
  | 'result_revealed'
  // Compartir MI resultado tras revelar (apuesta viral nº1). Props: surface
  // ('shared'|'downloaded'), group_id, challenge_id, points, distance_km. SIN
  // ubicación: el evento nunca lleva lat/lng ni nombre del lugar.
  | 'result_shared'
  // Eventos pre-declarados para las features en curso (tarjeta, onboarding,
  // home). Se declaran aquí de antemano para que esas features solo llamen a
  // track() sin editar este catálogo en paralelo (evita choques de merge).
  | 'leaderboard_shared'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'home_viewed'
  | 'create_group_cta'
  | 'join_group_cta'
  // CRUD de gestión (#146): editar/borrar reto, renombrar/borrar grupo y gestión
  // de miembros. Props: group_id siempre; challenge_id cuando aplique.
  | 'challenge_edited'
  | 'challenge_deleted'
  | 'group_renamed'
  | 'group_deleted'
  | 'member_kicked'
  | 'member_left'
  | 'ownership_transferred'
  // Invitación al grupo con preview (#155, OP2/I4). Props: surface
  // ('shared'|'copied'|'downloaded'), group_id. `invite_shared` = se abrió la
  // hoja de compartir del SO; `group_link_copied` = fallback de copiar enlace.
  | 'invite_shared'
  | 'group_link_copied'
  // Cambio de avatar desde el perfil (#168). Props: has_emoji (eligió un animal
  // del set) — sin más datos personales.
  | 'avatar_changed'
  // "Volver a jugar" en un reto de práctica (#181): borra el voto propio y
  // reinicia el juego. Solo en retos de práctica (plazo lejano). Props: group_id,
  // challenge_id.
  | 'challenge_replayed'
  // Fin de temporada (#236): cerrar/reabrir el grupo. Props: group_id.
  | 'group_closed'
  | 'group_reopened'

// Identidad del usuario para `identifyUser`. id = uuid de Supabase Auth (estable).
export interface AnalyticsIdentity {
  id: string
  email?: string | null
  name?: string | null
  avatar?: string | null
}

/**
 * Inicializa Mixpanel una sola vez (idempotente). No-op si no hay token, en
 * tests (MODE === 'test') o si VITE_ANALYTICS_DISABLED === 'true'. Llamar desde
 * main.tsx antes de montar la app.
 */
export function initAnalytics(): void {
  if (enabled) return
  if (!token || isTest || disabledByEnv) return

  mixpanel.init(token, {
    api_host: 'https://api-eu.mixpanel.com',
    autocapture: true,
    record_sessions_percent: 100,
    // Replay VISIBLE: por defecto Mixpanel enmascara todo el texto (`*`) y
    // bloquea `img,video`, así que el replay sale en negro (no se ve el mapa
    // —Leaflet usa <img>— ni la UI ni los botones). Lo invertimos: solo
    // enmascaramos datos sensibles (email/contraseña y lo marcado a mano con
    // [data-sensitive]) y no bloqueamos ningún elemento. Así el replay es útil.
    record_mask_text_selector: 'input[type=email], input[type=password], [data-sensitive]',
    record_block_selector: '',
  })
  enabled = true
}

/**
 * Registra un evento del producto. Tipado: solo nombres del catálogo. No-op si
 * la analítica no está activa (no inicializada, tests o desactivada).
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (!enabled) return
  mixpanel.track(event, props)
}

/**
 * Asocia los eventos al usuario autenticado y rellena su perfil en Mixpanel.
 * Idempotente: reidentificar con el mismo id no duplica. No-op si la analítica
 * no está activa.
 */
export function identifyUser({ id, email, name, avatar }: AnalyticsIdentity): void {
  if (!enabled) return
  mixpanel.identify(id)
  mixpanel.people.set({
    $email: email ?? undefined,
    $name: name ?? undefined,
    avatar: avatar ?? undefined,
  })
}

/** Desvincula la identidad (logout). No-op si la analítica no está activa. */
export function resetAnalytics(): void {
  if (!enabled) return
  mixpanel.reset()
}
