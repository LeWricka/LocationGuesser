import type { LatLng } from './geo'
import { supabase } from './supabase'

// Resolver de enlaces de Google Maps a un punto {lat,lng}. Dos caminos:
//   1) URLs largas y coordenadas pegadas → parser local (sin red).
//   2) Enlaces cortos (maps.app.goo.gl) → Edge Function que sigue la redirección.
// El botón "Compartir" de Maps en móvil genera enlaces cortos, de ahí la Edge Function.

function validLatLng(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Patrones que pueden aparecer en una URL larga de Maps, de más fiable a menos.
// `@lat,lng` (centro del mapa) y `!3d..!4d..` (place data) son los más precisos;
// los parámetros de query y el par suelto son el último recurso.
const PATTERNS: RegExp[] = [
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/, // @lat,lng
  /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/, // !3dlat!4dlng
  /[?&](?:q|query|ll)=(-?\d+\.?\d*),(-?\d+\.?\d*)/, // q=/query=/ll=lat,lng
  /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/, // par "lat,lng" suelto (con decimales)
]

/**
 * Extrae un punto de un texto: URL larga de Maps o coordenadas pegadas.
 * Devuelve null si no encuentra un par válido. No hace red.
 */
export function parseLatLngFromText(text: string): LatLng | null {
  const input = text.trim()
  if (!input) return null
  for (const re of PATTERNS) {
    const m = re.exec(input)
    if (m) {
      const point = validLatLng(Number(m[1]), Number(m[2]))
      if (point) return point
    }
  }
  return null
}

/** ¿Es un enlace corto de Google Maps que hay que des-acortar vía Edge Function? */
export function isShortMapsLink(url: string): boolean {
  const u = url.trim()
  return /https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(u)
}

/**
 * Resuelve cualquier entrada (URL o coordenadas) a un punto.
 * Primero intenta el parser local; si falla y es un enlace corto, llama a la
 * Edge Function `resolve-maps-url`. Devuelve null si no se puede resolver.
 */
export async function resolveMapsUrl(input: string): Promise<LatLng | null> {
  const local = parseLatLngFromText(input)
  if (local) return local

  if (!isShortMapsLink(input)) return null

  const { data, error } = await supabase.functions.invoke('resolve-maps-url', {
    body: { url: input.trim() },
  })
  if (error || !data) return null

  const { lat, lng } = data as { lat?: number; lng?: number }
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return validLatLng(lat, lng)
}
