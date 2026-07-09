// Función serverless de Vercel que sirve la PREVISUALIZACIÓN (tarjeta OG) de las
// rutas limpias `/v/<code>` (viaje) y `/j/<code>` (reto). El `vercel.json` reescribe
// esas rutas aquí con `?kind=&code=`.
//
// Estrategia (lo más simple que funciona, app estática sin backend propio):
//   · El crawler (WhatsApp, Telegram, Twitter, iMessage…) pide la URL, NO ejecuta
//     JS y NO ve el hash. Le devolvemos un shell HTML con las metas `og:*`/`twitter:*`
//     YA rellenas (título, descripción, og:image dinámica, og:url) → tarjeta bonita.
//   · El humano recibe el MISMO shell y un script que lo reenvía al hash que ya
//     enruta la app (`/#g=…[&c=…]`), entrando directo al viaje/reto. Sin tabla de
//     short codes: reutilizamos el id de grupo/reto que ya viaja en el hash.
//
// Los metadatos se leen con el SERVICE ROLE (env var en Vercel, NUNCA en repo): el
// crawler es anónimo y la RLS le ocultaría todo; service_role la salta (migración 0025).
//
// ⚠️ P0 — ESTE FICHERO ES DELIBERADAMENTE AUTOCONTENIDO (sin imports relativos).
// Causa del 500 `FUNCTION_INVOCATION_FAILED` que rompía TODO enlace compartido:
// `@vercel/node` compila cada función con `ts.transpileModule` (NO bundlea) y luego
// renombra los ficheros `.ts`→`.js`, pero `ts.transpileModule` deja los
// especificadores de import VERBATIM. Así, un `import … from './_meta.ts'` (o sin
// extensión) quedaba apuntando a un fichero que en runtime es `_meta.js` →
// `ERR_MODULE_NOT_FOUND` al CARGAR el módulo, ANTES de ejecutar el handler, por lo
// que ningún try/catch dentro del handler podía capturarlo. Sin import relativo no
// hay nada que resolver en runtime: el módulo SIEMPRE carga. La lógica de metadatos
// (antes en `_meta.ts`) va inline aquí y en `og.ts`; la duplicación es el precio de
// que estas dos funciones de infraestructura no puedan volver a caerse al arrancar.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const SITE_NAME = 'Momentu'

type ShareKind = 'trip' | 'challenge'

interface ShareMeta {
  kind: ShareKind
  /** Código (id de grupo o de reto) tal cual viene en la ruta limpia. */
  code: string
  /** id de grupo (para construir el hash de destino del cliente). */
  groupId: string
  /** id de reto, solo en `challenge`. */
  challengeId?: string
  /** Título a mostrar (nombre del viaje o título del reto). */
  title: string
  /** Nombre de quien comparte (display_name del dueño/creador), o null. */
  authorName: string | null
  /** Ruta de la portada en el bucket privado `images`, o null si no hay foto. */
  coverPath: string | null
}

// ── Acceso a Supabase (REST + service role), leído PEREZOSAMENTE ──────────────
// Nada de esto corre en la carga del módulo: `process.env` se lee dentro de las
// funciones, así que aunque falten TODAS las env de servidor el módulo carga igual
// (y `hasServerCreds()` devuelve false → servimos metas genéricas, nunca un throw).

function serverCreds(): { url: string; key: string } {
  return {
    url: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  }
}

/** ¿Hay credenciales de servidor configuradas? Sin ellas servimos metas genéricas. */
function hasServerCreds(): boolean {
  const { url, key } = serverCreds()
  return Boolean(url && key)
}

async function rest<T>(path: string): Promise<T[]> {
  const { url, key } = serverCreds()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) return []
  return (await res.json()) as T[]
}

async function displayName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const rows = await rest<{ display_name: string | null }>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=display_name`,
  )
  return rows[0]?.display_name ?? null
}

/** Portada de un viaje: la foto del reto/recuerdo más reciente con imagen. */
async function tripCover(groupId: string): Promise<string | null> {
  const rows = await rest<{ image_path: string | null }>(
    `challenges?group_id=eq.${encodeURIComponent(groupId)}&image_path=not.is.null&select=image_path&order=created_at.desc&limit=1`,
  )
  return rows[0]?.image_path ?? null
}

async function resolveTripMeta(code: string): Promise<ShareMeta | null> {
  if (!hasServerCreds()) return null
  const rows = await rest<{ id: string; name: string | null; created_by: string | null }>(
    `groups?id=eq.${encodeURIComponent(code)}&select=id,name,created_by&limit=1`,
  )
  const group = rows[0]
  if (!group) return null
  const [authorName, coverPath] = await Promise.all([
    displayName(group.created_by),
    tripCover(group.id),
  ])
  return {
    kind: 'trip',
    code,
    groupId: group.id,
    title: group.name?.trim() || 'Un viaje en Momentu',
    authorName,
    coverPath,
  }
}

async function resolveChallengeMeta(code: string): Promise<ShareMeta | null> {
  if (!hasServerCreds()) return null
  const rows = await rest<{
    id: string
    group_id: string
    title: string | null
    image_path: string | null
    created_by: string | null
  }>(
    `challenges?id=eq.${encodeURIComponent(code)}&select=id,group_id,title,image_path,created_by&limit=1`,
  )
  const ch = rows[0]
  if (!ch) return null
  const authorName = await displayName(ch.created_by)
  return {
    kind: 'challenge',
    code,
    groupId: ch.group_id,
    challengeId: ch.id,
    title: ch.title?.trim() || '¿Dónde es esta foto?',
    authorName,
    coverPath: ch.image_path,
  }
}

function resolveMeta(kind: ShareKind, code: string): Promise<ShareMeta | null> {
  return kind === 'trip' ? resolveTripMeta(code) : resolveChallengeMeta(code)
}

// ── Copy de la tarjeta OG (mismo tono que la maqueta compartir.html) ──────────

function ogHeadline(meta: ShareMeta): string {
  if (meta.kind === 'challenge') {
    return meta.authorName
      ? `${meta.authorName} te reta: ¿dónde es esta foto?`
      : '¿Dónde es esta foto?'
  }
  return meta.authorName
    ? `Vive el viaje de ${meta.authorName} en el mapa`
    : 'Vive este viaje en el mapa'
}

function ogDescription(meta: ShareMeta): string {
  return meta.kind === 'challenge'
    ? 'Clava el punto en el mapa antes de que acabe la cuenta atrás.'
    : 'Mira cada parada y adivina dónde estaba. Sin instalar nada.'
}

function ogEyebrow(meta: ShareMeta): string {
  if (meta.kind === 'challenge') {
    return meta.authorName ? `Un reto de ${meta.authorName}` : 'Un reto en Momentu'
  }
  return meta.authorName ? `Un viaje de ${meta.authorName}` : 'Un viaje en Momentu'
}

// ── Construcción del shell HTML ───────────────────────────────────────────────

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

// Escapa para insertar dentro de un atributo HTML (metas) sin romper el markup.
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Hash de destino que ya enruta la app. Viaje → `#g=`; reto → `#g=&c=` (el router
// de juego necesita grupo Y reto; el código de la ruta limpia es el del reto y el
// grupo lo resolvió `resolveMeta`).
function destinationHash(meta: ShareMeta): string {
  const g = encodeURIComponent(meta.groupId)
  if (meta.kind === 'challenge' && meta.challengeId) {
    return `#g=${g}&c=${encodeURIComponent(meta.challengeId)}`
  }
  return `#g=${g}`
}

function buildHtml(origin: string, kind: ShareKind, code: string, meta: ShareMeta | null): string {
  // Sin metadatos (grupo/reto inexistente o sin credenciales de servidor): metas
  // genéricas de marca y reenvío al hash crudo, que la app resolverá igual.
  const title = meta ? ogHeadline(meta) : SITE_NAME
  const description = meta
    ? ogDescription(meta)
    : 'Comparte tus viajes de una forma diferente: una foto, y los tuyos adivinan dónde es.'
  const eyebrow = meta ? ogEyebrow(meta) : SITE_NAME

  const cleanPath =
    kind === 'trip' ? `/v/${encodeURIComponent(code)}` : `/j/${encodeURIComponent(code)}`
  const ogUrl = `${origin}${cleanPath}`
  const ogImage = `${origin}/api/og?kind=${kind}&code=${encodeURIComponent(code)}`

  // Destino para el humano: el hash que enruta la app. Si no hay meta, mandamos al
  // hash crudo por tipo (la app resuelve el grupo del reto en cliente vía cleanRoute).
  const hash = meta
    ? destinationHash(meta)
    : kind === 'trip'
      ? `#g=${encodeURIComponent(code)}`
      : `#c=${encodeURIComponent(code)}`
  const redirectTo = `${origin}/${hash}`

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeAttr(title)} — ${SITE_NAME}</title>
    <meta name="description" content="${escapeAttr(description)}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(ogUrl)}" />
    <meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttr(eyebrow)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
    <meta name="twitter:image" content="${escapeAttr(ogImage)}" />

    <link rel="canonical" href="${escapeAttr(ogUrl)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta http-equiv="refresh" content="0; url=${escapeAttr(redirectTo)}" />
    <script>
      // Reenvío del humano a la app (el crawler no ejecuta JS y se queda con las
      // metas de arriba). replace() no deja la página intermedia en el historial.
      window.location.replace(${JSON.stringify(redirectTo)})
    </script>
  </head>
  <body>
    <p>Abriendo ${escapeAttr(eyebrow)} en ${SITE_NAME}…</p>
    <p><a href="${escapeAttr(redirectTo)}">Toca aquí si no se abre solo</a></p>
  </body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const kindParam = firstParam(req.query.kind)
  const code = firstParam(req.query.code)
  const kind: ShareKind = kindParam === 'challenge' ? 'challenge' : 'trip'

  const proto = firstParam(req.headers['x-forwarded-proto']) || 'https'
  const host = firstParam(req.headers['x-forwarded-host']) || req.headers.host || ''
  const origin = `${proto}://${host}`

  let meta: ShareMeta | null = null
  if (code) {
    try {
      meta = await resolveMeta(kind, code)
    } catch (err) {
      // Fallo de red/credenciales: caemos a metas genéricas (la app sigue abriendo).
      console.error('[api/share] resolveMeta falló, usando metas genéricas', { kind, code, err })
      meta = null
    }
  }

  // Red de seguridad de P0: el enlace compartido NUNCA debe devolver 500 al
  // receptor. Cualquier fallo inesperado al construir la tarjeta (no solo el de
  // resolveMeta, ya cubierto arriba) cae aquí y servimos igualmente un redirect
  // mínimo al hash de la app — el humano entra al viaje/reto aunque la
  // previsualización enriquecida no se pueda montar.
  try {
    // Cache moderada en el CDN: la tarjeta cambia poco (título/portada) y conviene
    // que el crawler la sirva rápido. stale-while-revalidate refresca en segundo plano.
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).send(buildHtml(origin, kind, code, meta))
  } catch (err) {
    console.error('[api/share] fallo inesperado construyendo la tarjeta', { kind, code, err })
    const fallbackHash =
      kind === 'trip' ? `#g=${encodeURIComponent(code)}` : `#c=${encodeURIComponent(code)}`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res
      .status(200)
      .send(
        `<!doctype html><html lang="es"><head><meta charset="utf-8" />` +
          `<meta http-equiv="refresh" content="0; url=${origin}/${fallbackHash}" /></head>` +
          `<body><p>Abriendo Momentu…</p>` +
          `<p><a href="${origin}/${fallbackHash}">Toca aquí si no se abre solo</a></p></body></html>`,
      )
  }
}
