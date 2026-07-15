// Mensajes de error legibles. El problema clásico: `String(err)` sobre un error
// que no es Error nativo (un objeto de Supabase/PostgREST, p.ej.) da
// '[object Object]', inútil para el usuario y para diagnosticar. `describeError`
// extrae un mensaje aprovechable de las formas de error que vemos en la app.

// Forma de un error de Supabase/PostgREST: no es un Error nativo, es un objeto
// plano con estos campos (todos opcionales). Tipado laxo a propósito: solo nos
// importa leer las propiedades si existen.
interface PostgrestLikeError {
  message?: unknown
  details?: unknown
  hint?: unknown
  code?: unknown
}

// ¿Tiene la pinta de un error de PostgREST/Supabase? (objeto con al menos una de
// las propiedades típicas, no un Error nativo).
function isPostgrestLike(err: unknown): err is PostgrestLikeError {
  if (typeof err !== 'object' || err === null || err instanceof Error) return false
  return 'message' in err || 'details' in err || 'hint' in err || 'code' in err
}

// Convierte un valor desconocido en texto si es una cadena no vacía; si no, null.
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Devuelve un mensaje legible a partir de cualquier error capturado.
 * Cubre: Error nativo (message), errores de Supabase/PostgREST (combina
 * message/details/hint/code) y fallback a String/JSON. Nunca devuelve
 * '[object Object]' ni cadena vacía.
 */
export function describeError(err: unknown): string {
  // Error nativo: el mensaje suele bastar.
  if (err instanceof Error) {
    return asText(err.message) ?? err.name ?? 'Error desconocido'
  }

  // Error de Supabase/PostgREST: combinamos lo útil. `message` es lo principal;
  // `details`/`hint` añaden contexto; `code` ayuda a diagnosticar.
  if (isPostgrestLike(err)) {
    const message = asText(err.message)
    const details = asText(err.details)
    const hint = asText(err.hint)
    const code = asText(err.code)

    const parts = [message, details, hint].filter((p): p is string => p !== null)
    if (parts.length > 0) {
      const base = parts.join(' · ')
      return code ? `${base} (${code})` : base
    }
    // Objeto tipo PostgREST pero sin texto útil: al menos devolvemos el código.
    if (code) return `Error ${code}`
  }

  // Cadena suelta lanzada como error.
  const asString = asText(err)
  if (asString) return asString

  // Último recurso: intentamos serializar el objeto a JSON (mejor que
  // '[object Object]'); si tampoco se puede, mensaje genérico.
  try {
    const json = JSON.stringify(err)
    if (json && json !== '{}' && json !== 'null') return json
  } catch {
    // No serializable (referencias circulares, etc.): caemos al genérico.
  }
  return 'Error desconocido'
}

/**
 * Código de error de Postgres/PostgREST (p.ej. `P0002` de una excepción de RPC,
 * `23503` de una FK violada), o `null` si el error no tiene esa forma. Distinguir
 * por CÓDIGO (no por el texto del mensaje, que puede cambiar de idioma o de
 * redacción en el servidor) es lo que permite tratar un recurso borrado como un
 * caso ESPERABLE en vez de un error genérico (issue #760).
 */
export function getErrorCode(err: unknown): string | null {
  return isPostgrestLike(err) ? asText(err.code) : null
}

/**
 * Error ESPERABLE (issue #760): el recurso (reto o viaje) fue borrado entre que
 * se abrió la pantalla/enlace y que el usuario actuó (cargar, votar, auto-join).
 * Se distingue de un fallo genérico de red/RLS con una CLASE propia (no un
 * string) para que:
 *  - la UI muestre un estado amable ("ya no existe" + CTA), no un toast crudo;
 *  - la observabilidad lo trate como esperable (breadcrumb, no excepción) — ver
 *    `reportError`/`addBreadcrumb` en `observability.ts`.
 */
export class ResourceGoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResourceGoneError'
  }
}
