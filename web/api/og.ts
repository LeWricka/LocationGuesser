// Imagen OG (1200×630) de un viaje/reto para la previsualización al compartir.
//
// Enfoque ROBUSTO (sin Satori/WASM ni runtime Edge, que rompían el build de
// Vercel): esta función Node resuelve la PORTADA real del viaje/reto y REDIRIGE
// (302) a su URL firmada del bucket privado `images`. Así la tarjeta enseña la
// FOTO real —lo que da confianza— sin componer la imagen aquí. Si no hay foto (o
// no hay credenciales de servidor), redirige a una imagen de marca estática.
//
// La firma usa el SERVICE ROLE (env var en Vercel, NUNCA en repo): el crawler es
// anónimo y la RLS le ocultaría la foto; service_role la salta (migración 0025).
// El crawler sigue la redirección y cachea el PNG resultante.
//
// ⚠️ P0 — AUTOCONTENIDO A PROPÓSITO (sin imports relativos): ver el porqué en la
// cabecera de `api/share.ts`. `@vercel/node` (`ts.transpileModule` + renombrado
// `.ts`→`.js`) dejaba los especificadores de import verbatim, y un
// `import … from './_meta.ts'` reventaba al CARGAR el módulo (fuera del alcance de
// cualquier try/catch del handler) → 500 `FUNCTION_INVOCATION_FAILED`. Sin import
// relativo el módulo SIEMPRE carga. La lógica de metadatos va inline (duplicada
// con `share.ts`) a cambio de que la función no pueda caerse al arrancar.

import type { VercelRequest, VercelResponse } from '@vercel/node'

type ShareKind = 'trip' | 'challenge'

interface ShareMeta {
  kind: ShareKind
  code: string
  groupId: string
  challengeId?: string
  title: string
  authorName: string | null
  coverPath: string | null
}

// Imagen de marca por defecto (en /public): se usa cuando el viaje/reto no tiene
// foto o no se puede firmar la portada. Así la tarjeta NUNCA queda sin imagen.
const FALLBACK_IMAGE = '/og-default.png'

// ── Acceso a Supabase (REST + service role), leído PEREZOSAMENTE ──────────────
// `process.env` se lee dentro de las funciones: aunque falten TODAS las env de
// servidor, el módulo carga igual y `hasServerCreds()` devuelve false (→ imagen de
// marca), nunca un throw en la carga.

function serverCreds(): { url: string; key: string } {
  return {
    url: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  }
}

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

/**
 * URL FIRMADA (temporal) de una imagen del bucket privado `images`, generada con
 * el service role (la firma no requiere membresía). Null si no se puede firmar.
 */
async function signedCoverUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!hasServerCreds()) return null
  const { url, key } = serverCreds()
  const res = await fetch(`${url}/storage/v1/object/sign/images/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { signedURL?: string }
  if (!data.signedURL) return null
  // signedURL viene como ruta relativa (`/object/sign/...`): la hacemos absoluta.
  return `${url}/storage/v1${data.signedURL}`
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const kind: ShareKind = firstParam(req.query.kind) === 'challenge' ? 'challenge' : 'trip'
  const code = firstParam(req.query.code)

  const proto = firstParam(req.headers['x-forwarded-proto']) || 'https'
  const host = firstParam(req.headers['x-forwarded-host']) || req.headers.host || ''
  const fallbackUrl = `${proto}://${host}${FALLBACK_IMAGE}`

  let target = fallbackUrl
  try {
    if (code) {
      const meta = await resolveMeta(kind, code)
      if (meta?.coverPath) {
        // Firma larga (24 h): la URL la cachea el crawler/CDN; no es secreta para
        // quien ya recibió el enlace de compartir.
        const signed = await signedCoverUrl(meta.coverPath, 86400)
        if (signed) target = signed
      }
    }
  } catch (err) {
    // Cualquier fallo (red, credenciales): caemos a la imagen de marca. Nunca 500:
    // sin imagen real, la tarjeta muestra el logo, pero el enlace sigue vivo.
    console.error('[api/og] fallo resolviendo portada, usando imagen de marca', {
      kind,
      code,
      err,
    })
    target = fallbackUrl
  }

  try {
    // Cache en el CDN: la portada cambia poco; revalida en segundo plano. La propia
    // redirección se cachea para no re-firmar en cada visita del crawler.
    res.setHeader(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    )
    res.redirect(302, target)
  } catch (err) {
    // Red de seguridad de P0: si incluso la redirección de marca fallara, no
    // dejamos que la función explote — devolvemos 200 vacío antes que un 500.
    console.error('[api/og] fallo inesperado sirviendo la imagen', { kind, code, err })
    res.status(200).send('')
  }
}
