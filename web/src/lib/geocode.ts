// Buscador de sitios por nombre (geocodificación directa) vía Nominatim
// (OpenStreetMap) — el mismo servicio que ya usa el proyecto para el
// reverse-geocoding de banderas (ver `countryFlag.ts`). Sin API key.
//
// El rate-limit de Nominatim (~1 req/s) lo respeta el CALLER con debounce (el
// picker de mapa lo hace en el cliente); este módulo no reintenta ni encola,
// solo dispara una búsqueda y la resuelve.

/** Un resultado de búsqueda: punto + nombre partido en corto/detalle. */
export interface PlaceResult {
  lat: number
  lng: number
  /** Primer tramo del nombre completo, p.ej. "Fushimi Inari-taisha". */
  name: string
  /** Resto del nombre completo (ciudad, región, país), o '' si no hay más. */
  detail: string
}

interface NominatimSearchResult {
  lat: string
  lon: string
  display_name: string
}

interface SearchOptions {
  /** Nº máximo de resultados (Nominatim admite más, pero 5 basta en un picker). */
  limit?: number
  /** Idioma de los nombres devueltos (`accept-language`). */
  lang?: string
}

/**
 * Busca sitios por nombre libre ('Bogotá', 'Fushimi Inari'). Devuelve como
 * mucho `limit` resultados. Sin resultados o cualquier fallo (red, JSON, HTTP)
 * NO es un error ruidoso: se resuelve a `[]` y el caller pinta "Sin
 * resultados". NUNCA lanza.
 */
export async function searchPlaces(
  query: string,
  { limit = 5, lang = 'es' }: SearchOptions = {},
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const url =
      'https://nominatim.openstreetmap.org/search' +
      `?format=jsonv2&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=${encodeURIComponent(lang)}`
    const res = await fetch(url, { headers: { 'Accept-Language': lang } })
    if (!res.ok) return []

    const data = (await res.json()) as NominatimSearchResult[]
    if (!Array.isArray(data)) return []

    const results: PlaceResult[] = []
    for (const r of data) {
      const lat = Number(r.lat)
      const lng = Number(r.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const [name, ...rest] = r.display_name.split(', ')
      results.push({ lat, lng, name: name || r.display_name, detail: rest.join(', ') })
    }
    return results
  } catch {
    // Red caída, JSON inválido, etc.: lista vacía, no error ruidoso.
    return []
  }
}
