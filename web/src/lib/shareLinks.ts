// Construcción de enlaces de compartir + copy cálido por tipo. Funciones PURAS
// (sin DOM ni red), reutilizables desde el cliente y desde la función serverless
// que genera la previsualización OG (web/api/share.ts). Aquí vive el contrato de
// las RUTAS LIMPIAS:
//
//   /v/<code>            → un VIAJE (grupo)
//   /j/<code>            → un RETO (reto concreto)
//
// El `code` es el MISMO que hoy viaja en el hash (`#g=<code>` / `&c=<code>`):
// reutilizamos el identificador de grupo/reto, no inventamos un short code nuevo.
// Las rutas limpias permiten al crawler ver una URL real (el hash es invisible
// para él) y servir una tarjeta OG. Los enlaces viejos con hash siguen vivos: el
// bootstrap de index.html traduce `/v/<code>` y `/j/<code>` al hash que ya enruta
// `parseHash`, así que el router de la app no cambia.

/** Tipo de destino compartible. */
export type ShareKind = 'trip' | 'challenge'

/** Prefijo de ruta limpia por tipo (`/v` viaje, `/j` reto). */
export const SHARE_PATH_PREFIX: Record<ShareKind, string> = {
  trip: '/v',
  challenge: '/j',
}

/**
 * Ruta limpia (sin origen) de un viaje: `/v/<code>`. El código se codifica para
 * URL por si trae caracteres especiales (los códigos actuales son alfanuméricos,
 * pero no lo damos por hecho).
 */
export function tripPath(code: string): string {
  return `${SHARE_PATH_PREFIX.trip}/${encodeURIComponent(code)}`
}

/**
 * Ruta limpia (sin origen) de un reto: `/j/<code>`. `code` es el id del reto; la
 * función serverless resuelve el grupo desde el reto, así que el enlace de reto
 * NO necesita llevar el código de grupo (a diferencia del hash `#g=…&c=…`).
 */
export function challengePath(code: string): string {
  return `${SHARE_PATH_PREFIX.challenge}/${encodeURIComponent(code)}`
}

/** URL absoluta de un viaje a partir del origen (`https://host/v/<code>`). */
export function tripShareUrl(origin: string, code: string): string {
  return `${stripTrailingSlash(origin)}${tripPath(code)}`
}

/** URL absoluta de un reto a partir del origen (`https://host/j/<code>`). */
export function challengeShareUrl(origin: string, code: string): string {
  return `${stripTrailingSlash(origin)}${challengePath(code)}`
}

function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, '')
}

// ── Copy cálido al compartir ────────────────────────────────────────────────
// El texto viaja con el enlace (navigator.share / portapapeles / wa.me). Los
// emojis son CONTENIDO: dan calidez y se quedan. El receptor ve quién comparte,
// qué comparte y un gancho a la mecánica. Mismo tono que la maqueta (compartir.html).

/** Texto de invitación a un VIAJE: «{quién} te invita a vivir su viaje «{título}»…». */
export function tripShareText(authorName: string, tripTitle: string): string {
  return `${authorName} te invita a vivir su viaje «${tripTitle}» 🌍 — mira cada parada en el mapa y adivina dónde estaba.`
}

/** Texto de reto: «{quién} te reta — ¡Adivina dónde está!». Corto y con gancho. */
export function challengeShareText(authorName: string): string {
  return `${authorName} te reta — ¡Adivina dónde está!`
}

/**
 * Enlace de WhatsApp prerelleno (fallback cuando no hay Web Share): abre el
 * selector de chat con `texto + url` listo para enviar. `wa.me` es el esquema
 * universal de WhatsApp (web y app).
 */
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
}
