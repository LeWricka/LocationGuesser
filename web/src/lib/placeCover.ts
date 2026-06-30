import { supabase } from './supabase'

// Portada AUTOMÁTICA a partir del nombre de un lugar, como FALLBACK cuando un
// viaje o un recuerdo no tiene imagen propia (si no, la tarjeta sale gris).
//
// La búsqueda real (REST de Wikipedia, sin API key) la hace la Edge Function
// `place-cover`; aquí solo (1) limpiamos el nombre para quitar el ruido típico de
// los títulos de viaje ("Finde Madrid" → "Madrid"), (2) invocamos la función y
// (3) cacheamos en memoria para no repegar en cada render. La UI consume
// `resolvePlaceCover` solo cuando NO hay `cover_image_path`/`image_path`.

/** Portada derivada de un nombre de lugar. `imageUrl` null = no se encontró foto
 * (la UI cae a su placeholder). `pageUrl` es el artículo de Wikipedia (atribución
 * CC-BY-SA de la imagen); `title` es el título del artículo que casó. */
export interface PlaceCover {
  imageUrl: string | null
  pageUrl: string | null
  title: string | null
}

const EMPTY: PlaceCover = { imageUrl: null, pageUrl: null, title: null }

// Prefijos típicos de un título de viaje que NO son el topónimo y estorban a la
// búsqueda ("Finde en Madrid", "Viaje a París" → "Madrid"/"París"). Se quitan solo
// si van al principio. Lista corta y conservadora: ante la duda, dejamos el texto.
const TRIP_PREFIXES = [
  'finde de',
  'finde en',
  'finde',
  'fin de semana en',
  'fin de semana',
  'viaje a',
  'viaje por',
  'viaje',
  'escapada a',
  'escapada',
  'ruta por',
  'ruta',
  'vacaciones en',
  'vacaciones',
  'puente en',
  'puente de',
]

/**
 * Limpia el nombre antes de buscar: quita emojis/símbolos, colapsa espacios y
 * retira un prefijo de viaje al principio ("Viaje a Roma" → "Roma"). Si tras
 * quitar el prefijo no queda nada (el nombre ERA solo el prefijo, p.ej. "Viaje"),
 * devuelve el texto original limpio: mejor buscar algo que nada. Función pura.
 */
export function normalizePlaceName(raw: string): string {
  // Quitamos emojis y símbolos sueltos pero conservamos letras (con acentos),
  // números, espacios y separadores comunes de topónimo (coma, guion, apóstrofo).
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s,'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''

  const lower = cleaned.toLowerCase()
  for (const prefix of TRIP_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      const rest = cleaned.slice(prefix.length).trim()
      // Solo aplicamos el recorte si deja un topónimo no vacío.
      if (rest) return rest
    }
  }
  return cleaned
}

// Cache en memoria por nombre YA normalizado. Guardamos también los "sin foto"
// (EMPTY) para no repetir una llamada que ya sabemos que no da imagen. Vive lo que
// viva la pestaña; las URLs de Wikimedia son estables, no hace falta caducarla.
const cache = new Map<string, PlaceCover>()

/**
 * Resuelve la portada automática para un nombre de lugar. Devuelve siempre un
 * `PlaceCover` (nunca lanza): ante un nombre vacío o un fallo de red, devuelve
 * `imageUrl: null` para que la UI use su placeholder sin romperse. Cachea por
 * nombre normalizado.
 *
 * Pensado como FALLBACK: el llamante solo debe invocarlo cuando el viaje/recuerdo
 * no tiene imagen propia.
 */
export async function resolvePlaceCover(name: string | null | undefined): Promise<PlaceCover> {
  const normalized = normalizePlaceName(name ?? '')
  if (!normalized) return EMPTY

  const cached = cache.get(normalized)
  if (cached) return cached

  try {
    // La app es solo en español: pedimos 'es' como idioma preferido (la función
    // cae a 'en' si en español no hay foto).
    const { data, error } = await supabase.functions.invoke('place-cover', {
      body: { name: normalized, lang: 'es' },
    })
    if (error || !data) {
      cache.set(normalized, EMPTY)
      return EMPTY
    }
    const { image_url, page_url, title } = data as {
      image_url?: unknown
      page_url?: unknown
      title?: unknown
    }
    const result: PlaceCover = {
      imageUrl: typeof image_url === 'string' && image_url ? image_url : null,
      pageUrl: typeof page_url === 'string' && page_url ? page_url : null,
      title: typeof title === 'string' && title ? title : null,
    }
    cache.set(normalized, result)
    return result
  } catch {
    // Best-effort: un tropiezo de red no debe romper la tarjeta. No cacheamos el
    // fallo (puede ser transitorio): un próximo render reintentará.
    return EMPTY
  }
}

/** Vacía la cache en memoria. Solo para tests (aislar casos entre sí). */
export function clearPlaceCoverCache(): void {
  cache.clear()
}
