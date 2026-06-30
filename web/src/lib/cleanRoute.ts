// Traducción de las RUTAS LIMPIAS (`/v/<code>`, `/j/<code>`) al HASH que ya
// enruta `parseHash` (lib/route.ts). Es el puente de COMPATIBILIDAD: el router de
// la app sigue siendo por hash (no lo tocamos), y los enlaces viejos `#g=…&c=…`
// siguen vivos igual. Solo añadimos una capa que, al cargar una ruta limpia,
// reescribe la URL a `/#g=…[&c=…]` con `history.replaceState` (sin recargar) y
// deja que el router de siempre pinte.
//
// Por qué en el cliente además de en la función serverless: la función `web/api/share`
// sirve el shell con metas OG ya resueltas para los CRAWLERS, pero en `npm run dev`
// (Vite, sin serverless) o navegando dentro de la SPA no pasa por ella. Esta capa
// garantiza que `/v/<code>` y `/j/<code>` funcionen SIEMPRE.
//
// Reto (`/j/<code>`): el hash de juego necesita grupo Y reto (`#g=…&c=…`), pero la
// ruta limpia solo trae el id del reto. Resolvemos el grupo con una consulta barata
// (RLS: solo miembros; el auto-join al grupo corre después igual que en cualquier
// deep link). Si no se puede resolver (no miembro aún, red), dejamos `#c=<code>` y la
// app cae con gracia a la landing/login, que guarda el destino y reintenta tras el alta.

import { supabase } from './supabase'
import { track } from './analytics'

const TRIP_RE = /^\/v\/([^/?#]+)\/?$/
const CHALLENGE_RE = /^\/j\/([^/?#]+)\/?$/

/**
 * Si la URL actual es una ruta limpia, la reescribe al hash equivalente (sin
 * recargar) para que `parseHash` la enrute. No-op si no es ruta limpia o si ya
 * hay hash (un enlace viejo `#g=…` manda y no se toca). Async porque resolver el
 * grupo de un reto puede requerir una consulta.
 *
 * Además es el chokepoint del embudo del RECEPTOR (#330): aquí, ANTES de
 * login/join, sabemos que el visitante aterrizó por un enlace compartido (ruta
 * limpia o enlace viejo con hash de grupo/reto), así que emitimos
 * `share_link_opened`. Es el único punto del arranque por el que pasan los TRES
 * formatos de enlace (`/v/`, `/j/`, `#g=`/`#c=`).
 */
export async function applyCleanRoute(): Promise<void> {
  if (typeof window === 'undefined') return

  // Un hash explícito (enlace viejo o navegación interna) tiene prioridad: no lo
  // pisamos. Solo actuamos sobre el PATH limpio. Aun así, un enlace VIEJO con
  // hash de grupo/reto SÍ es una recepción: la medimos y salimos sin reescribir.
  if (window.location.hash) {
    void trackShareLinkOpenedFromHash(window.location.hash)
    return
  }

  const path = window.location.pathname

  const trip = path.match(TRIP_RE)
  if (trip) {
    const code = decodeURIComponent(trip[1])
    void trackShareLinkOpened('trip')
    rewriteToHash(`#g=${encodeURIComponent(code)}`)
    return
  }

  const challenge = path.match(CHALLENGE_RE)
  if (challenge) {
    const code = decodeURIComponent(challenge[1])
    void trackShareLinkOpened('challenge')
    const groupId = await resolveChallengeGroup(code)
    const hash = groupId
      ? `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(code)}`
      : `#c=${encodeURIComponent(code)}`
    rewriteToHash(hash)
  }
}

// Mide la recepción de un enlace VIEJO con hash (`#g=…`, `#g=…&c=…` o `#c=…`): el
// tipo es 'challenge' si trae reto (`c`), si no 'trip'. Un hash sin grupo/reto
// (navegación interna como `#nuevo`/`#perfil`) no es recepción y no se mide.
async function trackShareLinkOpenedFromHash(hash: string): Promise<void> {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const hasGroup = params.has('g')
  const hasChallenge = params.has('c')
  if (!hasGroup && !hasChallenge) return
  await trackShareLinkOpened(hasChallenge ? 'challenge' : 'trip')
}

// Emite `share_link_opened` con el tipo y si el visitante YA llega con sesión
// (recurrente) o sin ella (entrará por login). SIN el código del grupo/reto: es
// identificable y el embudo solo necesita el tipo y la presencia de sesión.
async function trackShareLinkOpened(kind: 'trip' | 'challenge'): Promise<void> {
  let hasSession = false
  try {
    const { data } = await supabase.auth.getSession()
    hasSession = data.session != null
  } catch {
    // Sin poder resolver la sesión (red): asumimos que no hay; no bloquea.
  }
  track('share_link_opened', { kind, has_session: hasSession })
}

// Resuelve el grupo de un reto por su id. RLS limita a miembros; un no-miembro
// recibe null y la app cae a login (que guarda el destino y reintenta tras el alta).
async function resolveChallengeGroup(challengeId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('challenges')
      .select('group_id')
      .eq('id', challengeId)
      .maybeSingle<{ group_id: string }>()
    return data?.group_id ?? null
  } catch {
    return null
  }
}

// Reescribe la barra de direcciones a `/<hash>` SIN recargar (replaceState, así no
// crea una entrada de historial extra) y dispara `hashchange` para que el router
// repinte. Mantenemos el path en `/` para que el hash sea el de siempre.
function rewriteToHash(hash: string): void {
  window.history.replaceState(null, '', `/${hash}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
