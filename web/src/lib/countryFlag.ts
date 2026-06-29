// Bandera + nombre de país a partir de una coordenada, para mostrar
// "🇲🇾 MALASIA" en los momentos de un viaje (estilo Polarsteps).
//
// Reverse-geocoding vía Nominatim (OpenStreetMap), el mismo servicio que ya usa
// el proyecto para geocodificar. En navegador no podemos fijar `User-Agent`
// (cabecera prohibida), así que pedimos el idioma con `accept-language=es` para
// recibir el nombre del país en español.

export interface CountryInfo {
  /** ISO 3166-1 alpha-2 en mayúsculas, p.ej. 'MY'. */
  code: string
  /** Nombre del país en español y en MAYÚSCULAS, p.ej. 'MALASIA'. */
  name: string
  /** Emoji de bandera derivado del código, p.ej. '🇲🇾'. */
  flag: string
}

// Base de los "regional indicator symbols": 'A' (0x41) → 0x1F1E6.
const REGIONAL_INDICATOR_BASE = 0x1f1e6
const LETTER_A = 'A'.charCodeAt(0)
const LETTER_Z = 'Z'.charCodeAt(0)

/**
 * Emoji de bandera a partir de un código ISO alpha-2 (función pura, testeable).
 * Cada letra A-Z se mapea a su "regional indicator symbol"; el par de símbolos
 * lo renderiza el sistema como bandera. Devuelve '' si el código no es un par
 * de letras A-Z válido (así nunca pintamos un emoji roto).
 */
export function flagFromCountryCode(code: string): string {
  const up = code.trim().toUpperCase()
  if (up.length !== 2) return ''

  let flag = ''
  for (const ch of up) {
    const c = ch.charCodeAt(0)
    if (c < LETTER_A || c > LETTER_Z) return ''
    flag += String.fromCodePoint(REGIONAL_INDICATOR_BASE + (c - LETTER_A))
  }
  return flag
}

// Caché en memoria por coordenada redondeada. Motivo: Nominatim limita a ~1
// req/s y muchos momentos caen en el mismo país/ciudad; redondear a 2 decimales
// (~1 km) agrupa puntos cercanos en la misma clave y evita repetir la llamada.
const cache = new Map<string, CountryInfo | null>()
const ROUND_DECIMALS = 2

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(ROUND_DECIMALS)},${lng.toFixed(ROUND_DECIMALS)}`
}

interface NominatimReverseResponse {
  address?: {
    country?: string
    country_code?: string
  }
}

/**
 * Reverse-geocode de una coordenada a su país. Devuelve `code`, `name` (español
 * en mayúsculas) y `flag`, o `null` ante cualquier fallo o si no hay país (mar
 * abierto, respuesta sin dirección, etc.). NUNCA lanza: el caller solo decide
 * mostrar u ocultar la etiqueta.
 *
 * Sin reintentos: respetamos el rate-limit de Nominatim y dejamos que la caché
 * absorba las repeticiones; un fallo puntual simplemente no pinta la bandera.
 */
export async function countryFromCoords(lat: number, lng: number): Promise<CountryInfo | null> {
  const key = cacheKey(lat, lng)
  const cached = cache.get(key)
  // `undefined` = nunca consultado; `null` = consultado y sin país (se cachea
  // igual para no reintentar un punto que ya sabemos que no tiene país).
  if (cached !== undefined) return cached

  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse' +
      `?format=jsonv2&lat=${lat}&lon=${lng}&zoom=3&addressdetails=1&accept-language=es`
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } })
    if (!res.ok) {
      cache.set(key, null)
      return null
    }

    const data = (await res.json()) as NominatimReverseResponse
    const country = data.address?.country
    const countryCode = data.address?.country_code
    if (!country || !countryCode) {
      cache.set(key, null)
      return null
    }

    const code = countryCode.toUpperCase()
    const info: CountryInfo = {
      code,
      name: country.toUpperCase(),
      flag: flagFromCountryCode(code),
    }
    cache.set(key, info)
    return info
  } catch {
    // Red caída, JSON inválido, etc.: cacheamos el fallo para no martillear.
    cache.set(key, null)
    return null
  }
}

/** Vacía la caché en memoria (solo para tests). */
export function clearCountryCache(): void {
  cache.clear()
}
