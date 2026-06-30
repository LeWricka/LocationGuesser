// Edge Function (Deno) que deriva una PORTADA bonita a partir del nombre de un
// lugar, para cuando un viaje o un recuerdo no tiene imagen propia.
//
// Por qué en el servidor y no en el front: la REST de Wikipedia no manda
// cabeceras CORS para todos los orígenes de forma fiable, y queremos un único
// punto donde fijar el User-Agent (su política lo exige) y sanear/elegir la mejor
// imagen. El front llama a esta función vía `supabase.functions.invoke`.
//
// Fuente: REST de Wikipedia (`page/summary`) + búsqueda REST como respaldo. Sin
// API key. Las imágenes son de Wikimedia Commons (CDN `upload.wikimedia.org`),
// públicas y estables; licencia CC-BY-SA / dominio público. La atribución vive en
// la página del artículo (`content_urls.desktop.page`), que devolvemos junto a la
// imagen para que la UI pueda enlazarla si quiere.
//
// Contrato:
//   POST { name: string, lang?: string }
//     200 -> { image_url: string|null, page_url: string|null, title: string|null }
//     422 -> { error: string }   (falta el nombre)
//   OPTIONS -> 204 (preflight CORS)
//
// `image_url: null` (con 200) significa "no encontré una buena foto": NO es un
// error, es el caso esperado para nombres sin artículo con imagen. El front trata
// ese caso cayendo a su placeholder de siempre.

// CORS abierto: lo llama el front estático desde cualquier origen de Vercel
// (incl. previews). No maneja datos sensibles: solo recibe un topónimo y devuelve
// una URL de imagen pública. El riesgo de "proxy abierto" es nulo porque NO
// hacemos fetch a una URL del usuario: solo a la REST de Wikipedia (host fijo).
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// La política de la API de Wikimedia pide un User-Agent identificativo con
// contacto. Sin él, pueden devolver 403/429. Es público (no es un secreto).
const USER_AGENT = 'LocationGuesser/1.0 (https://locationguesser-sage.vercel.app; Iker@540deg.com)'

// Idiomas permitidos: la app es solo en español, pero un topónimo puede tener
// mejor artículo (con foto) en otra lengua, así que probamos es → en. Allowlist
// estricta: el `lang` entra en el host de la URL, así que validarlo evita que un
// valor raro construya un host arbitrario (defensa en profundidad anti-SSRF).
const ALLOWED_LANGS = new Set(['es', 'en'])
const DEFAULT_LANGS = ['es', 'en']

// Solo aceptamos imágenes servidas desde el CDN de Wikimedia: la summary trae la
// imagen ya alojada ahí. Filtrar por host evita devolver una URL inesperada si la
// API cambiara su forma de responder (fail-closed sobre el origen de la imagen).
function isWikimediaImage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org'
  } catch {
    return false
  }
}

interface SummaryResult {
  imageUrl: string | null
  pageUrl: string | null
  title: string | null
}

// Imagen + página de un artículo por su título exacto, vía `page/summary`. La
// REST sigue redirecciones de título (p.ej. "Madrid, España" → "Madrid") y trae
// `originalimage`/`thumbnail`. Preferimos `originalimage` (mejor resolución) y
// caemos a `thumbnail`. Devuelve nulls si el artículo no existe o no tiene foto.
async function summaryFor(lang: string, title: string): Promise<SummaryResult> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) return { imageUrl: null, pageUrl: null, title: null }
  const data = (await res.json()) as {
    title?: string
    type?: string
    originalimage?: { source?: string }
    thumbnail?: { source?: string }
    content_urls?: { desktop?: { page?: string } }
  }
  // Páginas de desambiguación ("Madrid (desambiguación)") no son una buena
  // portada: su imagen, si la hay, es genérica. Las descartamos.
  if (data.type === 'disambiguation') return { imageUrl: null, pageUrl: null, title: null }

  const candidate = data.originalimage?.source ?? data.thumbnail?.source ?? null
  const imageUrl = candidate && isWikimediaImage(candidate) ? candidate : null
  return {
    imageUrl,
    pageUrl: data.content_urls?.desktop?.page ?? null,
    title: data.title ?? title,
  }
}

// Busca el título de artículo que mejor encaja con el texto del usuario, vía la
// REST de búsqueda de páginas. Lo usamos cuando el `summary` directo no encontró
// imagen (p.ej. el usuario escribió "finde madrid" en vez de "Madrid"): la
// búsqueda tolera el ruido alrededor del topónimo. Devuelve el título o null.
async function searchTitle(lang: string, query: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
    query,
  )}&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { pages?: Array<{ title?: string }> }
  return data.pages?.[0]?.title ?? null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Resuelve la portada para un nombre en un idioma: 1) summary directo por el
// nombre tal cual; 2) si no hay foto, busca el mejor título y reintenta el
// summary. Devuelve el primer resultado con imagen, o todo null.
async function resolveInLang(lang: string, name: string): Promise<SummaryResult> {
  const direct = await summaryFor(lang, name)
  if (direct.imageUrl) return direct

  const found = await searchTitle(lang, name)
  if (found && found.toLowerCase() !== name.toLowerCase()) {
    const viaSearch = await summaryFor(lang, found)
    if (viaSearch.imageUrl) return viaSearch
  }
  return { imageUrl: null, pageUrl: null, title: null }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight CORS.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Usa POST con { name }' }, 405)
  }

  let body: { name?: unknown; lang?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body JSON inválido' }, 422)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return json({ error: "Falta el campo 'name' (string)" }, 422)
  }

  // Idioma preferido si el cliente lo pide y está en la allowlist; si no, es→en.
  const preferred = typeof body.lang === 'string' ? body.lang.toLowerCase() : ''
  const langs =
    preferred && ALLOWED_LANGS.has(preferred)
      ? [preferred, ...DEFAULT_LANGS.filter((l) => l !== preferred)]
      : DEFAULT_LANGS

  // Probamos los idiomas en orden; el primero con foto gana. Cualquier fallo de
  // red por idioma se trata como "sin foto aquí" y se sigue con el siguiente: la
  // función nunca devuelve 500 por un tropiezo de la API externa (best-effort).
  for (const lang of langs) {
    try {
      const result = await resolveInLang(lang, name)
      if (result.imageUrl) {
        return json({ image_url: result.imageUrl, page_url: result.pageUrl, title: result.title })
      }
    } catch {
      // Seguimos con el siguiente idioma.
    }
  }

  // Sin foto en ningún idioma: 200 con nulls (no es un error; el front usa su
  // placeholder de siempre).
  return json({ image_url: null, page_url: null, title: null })
})
