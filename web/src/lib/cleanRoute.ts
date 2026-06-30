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

const TRIP_RE = /^\/v\/([^/?#]+)\/?$/
const CHALLENGE_RE = /^\/j\/([^/?#]+)\/?$/

/**
 * Si la URL actual es una ruta limpia, la reescribe al hash equivalente (sin
 * recargar) para que `parseHash` la enrute. No-op si no es ruta limpia o si ya
 * hay hash (un enlace viejo `#g=…` manda y no se toca). Async porque resolver el
 * grupo de un reto puede requerir una consulta.
 */
export async function applyCleanRoute(): Promise<void> {
  if (typeof window === 'undefined') return
  // Un hash explícito (enlace viejo o navegación interna) tiene prioridad: no lo
  // pisamos. Solo actuamos sobre el PATH limpio.
  if (window.location.hash) return

  const path = window.location.pathname

  const trip = path.match(TRIP_RE)
  if (trip) {
    const code = decodeURIComponent(trip[1])
    rewriteToHash(`#g=${encodeURIComponent(code)}`)
    return
  }

  const challenge = path.match(CHALLENGE_RE)
  if (challenge) {
    const code = decodeURIComponent(challenge[1])
    const groupId = await resolveChallengeGroup(code)
    const hash = groupId
      ? `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(code)}`
      : `#c=${encodeURIComponent(code)}`
    rewriteToHash(hash)
  }
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
