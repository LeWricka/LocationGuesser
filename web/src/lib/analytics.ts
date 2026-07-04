// Analítica (Mixpanel) — punto ÚNICO de acceso. Otras features importan `track`
// y los nombres de evento desde aquí; nada de strings sueltos ni del SDK directo
// fuera de esta lib. El token es público (como la publishable key de Supabase),
// con fallback embebido para que funcione sin configurar env en local.
//
// CARGA DIFERIDA (perf): `mixpanel-browser` pesa ~413 KB y antes se importaba de
// forma estática + init síncrono en el arranque, lastrando el camino crítico de
// la landing. Ahora el SDK se carga con `import()` dinámico (Vite lo separa en su
// propio chunk) tras `requestIdleCallback`/primera interacción, y mientras tanto
// `track`/`identify`/`reset` se ENCOLAN y se reproducen al cargar. Así no se
// pierde ningún evento y el bundle inicial no incluye Mixpanel.
//
// Idempotente y a prueba de "no inicializado": todo lo público pasa por el guard
// `armed`, así llamar a track/identify antes de cargar (o en tests) es seguro.

// Tipo mínimo del SDK que usamos (el módulo real se carga perezosamente). Evita
// arrastrar `mixpanel-browser` al grafo estático del bundle.
type MixpanelClient = typeof import('mixpanel-browser').default

// Token público de Mixpanel (proyecto EU). Va en el bundle del cliente por
// diseño; el env permite sobreescribirlo por entorno sin tocar código.
const FALLBACK_TOKEN = '804a0a0fe0da2496051217c66bd0ff83'

const token = import.meta.env.VITE_MIXPANEL_TOKEN ?? FALLBACK_TOKEN

// Apagamos la analítica cuando: no hay token, estamos en tests (unit/E2E no deben
// mandar eventos) o el entorno lo desactiva explícitamente (VITE_ANALYTICS_DISABLED).
const disabledByEnv = import.meta.env.VITE_ANALYTICS_DISABLED === 'true'
const isTest = import.meta.env.MODE === 'test'

// `armed` = la analítica está activa (token presente, no test, no desactivada) y
// hemos pedido cargar el SDK. `mp` = la instancia ya cargada e inicializada (null
// hasta entonces). Mientras `armed && !mp`, las llamadas se encolan.
let armed = false
let mp: MixpanelClient | null = null

// Cola de operaciones pendientes hasta que el SDK cargue. Se reproducen en orden
// al estar listo, así no se pierde ningún evento emitido durante el arranque.
const queue: ((m: MixpanelClient) => void)[] = []

function enqueue(op: (m: MixpanelClient) => void): void {
  if (mp) {
    op(mp)
    return
  }
  if (armed) queue.push(op)
  // Si no está armado (sin token / test / desactivado), es un no-op silencioso.
}

// ── Catálogo de eventos ──────────────────────────────────────────────────────
// Nombres en snake_case. Tipar la unión obliga a usar nombres válidos en todo el
// código; añadir un evento nuevo = añadirlo aquí.
export type AnalyticsEvent =
  | 'signup_completed'
  | 'login'
  // Email de acceso (código OTP + enlace) SOLICITADO desde el cliente. Cuenta
  // exacta de envíos que pedimos a Supabase: si al usuario le llegan 2 correos
  // y aquí hay 1 evento, la duplicación es del lado servidor/SMTP, no nuestra.
  // Props: reenvio (false = submit inicial, true = botón reenviar).
  | 'login_email_solicitado'
  | 'group_created'
  | 'group_joined'
  | 'challenge_created'
  // Recuerdo creado (momento SIN reto, separación contenido/reto). Props:
  // group_id, challenge_id, has_photo, has_place, has_audio (nota de voz,
  // #648), promoted_to_challenge (¿se convirtió en reto al crearlo?). SIN
  // lat/lng ni nombre del lugar.
  | 'moment_created'
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
  // Edición de los datos del viaje desde Ajustes (#428): fechas/descripción/
  // acompañantes. Props: group_id, has_dates, has_description, has_companions.
  | 'group_trip_edited'
  // Portada del viaje elegida entre las fotos ya subidas a sus momentos (#428).
  // Props: group_id, cleared (true = se quitó la portada, vuelve a la derivada).
  | 'group_cover_set'
  | 'member_kicked'
  | 'member_left'
  | 'ownership_transferred'
  // Co-dueños (#307): un dueño promueve/degrada a un miembro. Props: group_id, role
  // ('owner' = hecho co-dueño, 'member' = degradado).
  | 'member_role_changed'
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
  // Recepción de un enlace compartido (#330): el visitante aterriza por una ruta
  // compartida (/v/<code>, /j/<code> o el hash #g=) ANTES de login/join. Mide la
  // entrada del embudo del receptor (hoy ciego). Props: kind ('trip'|'challenge'),
  // has_session (¿llegó ya con sesión?). SIN datos sensibles: nada de lat/lng ni
  // del lugar, y tampoco mandamos el código del grupo/reto (es identificable).
  | 'share_link_opened'
  // La bienvenida del receptor se muestra (#330): un invitado primerizo (no dueño)
  // ve el slideshow "te invitan". Cierra el embudo: aterrizó → se le saludó.
  // Props: group_id.
  | 'receptor_welcome_shown'
  // Nota de voz de un momento (issue #648). `voice_note_recorded`: se terminó
  // de grabar (stop manual o auto-stop a los 60s), en `VoiceRecorder` — antes
  // de saberse si la subida al guardar el momento tendrá éxito. Props:
  // duration_seconds. `voice_note_played`: se pulsó play en el reproductor de
  // la VISTA (`MomentSheet`), solo la primera vez por apertura de la hoja (no
  // en cada pausa/resume). Props: challenge_id. Ninguno de los dos lleva
  // contenido del audio ni ubicación.
  | 'voice_note_recorded'
  | 'voice_note_played'

// Identidad del usuario para `identifyUser`. id = uuid de Supabase Auth (estable).
export interface AnalyticsIdentity {
  id: string
  email?: string | null
  name?: string | null
  avatar?: string | null
}

// Programa una callback para cuando el navegador esté ocioso, con respaldo en
// setTimeout (Safari no soporta requestIdleCallback). Sacamos la carga del SDK
// del camino crítico del arranque.
function whenIdle(cb: () => void): void {
  const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback
  if (typeof ric === 'function') ric(cb)
  else setTimeout(cb, 1)
}

// Carga e inicializa el SDK real una sola vez; al estar listo, vacía la cola.
async function loadMixpanel(): Promise<void> {
  if (mp) return
  const mixpanel = (await import('mixpanel-browser')).default
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
  mp = mixpanel
  // Reproduce, en orden, todo lo que se encoló mientras cargaba.
  for (const op of queue.splice(0)) op(mixpanel)
}

/**
 * Activa la analítica (idempotente). No-op si no hay token, en tests
 * (MODE === 'test') o si VITE_ANALYTICS_DISABLED === 'true'. Llamar desde
 * main.tsx en el arranque: NO carga el SDK de inmediato, lo difiere a
 * `requestIdleCallback` (fallback setTimeout) para no lastrar el camino crítico.
 * Hasta entonces, track/identify/reset se encolan (no se pierde nada).
 */
export function initAnalytics(): void {
  if (armed) return
  if (!token || isTest || disabledByEnv) return
  armed = true
  whenIdle(() => void loadMixpanel())
}

/**
 * Registra un evento del producto. Tipado: solo nombres del catálogo. Si el SDK
 * aún no cargó, se encola y se emite al estar listo. No-op si la analítica no
 * está activa (sin token, tests o desactivada).
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  enqueue((m) => m.track(event, props))
}

/**
 * Asocia los eventos al usuario autenticado y rellena su perfil en Mixpanel.
 * Idempotente: reidentificar con el mismo id no duplica. Se encola si el SDK aún
 * no cargó. No-op si la analítica no está activa.
 */
export function identifyUser({ id, email, name, avatar }: AnalyticsIdentity): void {
  enqueue((m) => {
    m.identify(id)
    m.people.set({
      $email: email ?? undefined,
      $name: name ?? undefined,
      avatar: avatar ?? undefined,
    })
  })
}

/** Desvincula la identidad (logout). Se encola si el SDK aún no cargó. No-op si la analítica no está activa. */
export function resetAnalytics(): void {
  enqueue((m) => m.reset())
}
