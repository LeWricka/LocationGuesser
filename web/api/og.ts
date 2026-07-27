// Imagen OG (1200×630) de un viaje/reto para la previsualización al compartir.
//
// Enfoque ROBUSTO (sin Satori/WASM ni runtime Edge, que rompían el build de
// Vercel): esta función Node resuelve la PORTADA real del viaje/reto, la firma
// en el bucket privado `images` y REENVÍA LOS BYTES ella misma (200 + Content-Type
// de imagen). Si no hay foto (o no hay credenciales de servidor), sirve la imagen
// de marca estática por el mismo camino.
//
// ⚠️ Bug #958 (tarjeta SIEMPRE en negro en WhatsApp, aunque el reto SÍ tenía
// foto): la versión anterior hacía `res.redirect(302, urlFirmada)`. Los
// crawlers de previsualización (WhatsApp/Facebook comparten `facebookexternalhit`)
// exigen que `og:image` devuelva 200 SIN redirecciones — no reintentan, cachean
// el fallo al primer tropiezo, y cada salto consume su presupuesto de timeout.
// Un 302 a una URL firmada de Supabase Storage es exactamente lo que rompe: el
// crawler se queda sin imagen y WhatsApp pinta la tarjeta con el título sobre un
// fondo oscuro — lo que se reportaba como "negro, sin foto". Fix: la función
// hace ELLA MISMA el fetch de la URL firmada (o de la imagen de marca) y
// devuelve los bytes con 200 — cero redirecciones expuestas al crawler.
//
// La firma usa el SERVICE ROLE (env var en Vercel, NUNCA en repo): el crawler es
// anónimo y la RLS le ocultaría la foto; service_role la salta (migración 0025).
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
 * Vida corta: la consumimos NOSOTROS al momento (fetch server-to-server, nunca
 * se expone al crawler), así que no hace falta que dure horas.
 */
async function signedCoverUrl(path: string, expiresIn = 120): Promise<string | null> {
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

/** Content-Type de reserva si la respuesta de origen no trae uno usable. */
const DEFAULT_CONTENT_TYPE = 'image/jpeg'

/**
 * Trae los BYTES de `imageUrl` y los escribe en la respuesta (200 + Content-Type
 * de imagen real). Lanza si el fetch falla o la respuesta no es 2xx, para que el
 * llamador pueda caer al fallback de marca — nunca deja la respuesta a medio
 * escribir (no toca `res` hasta tener el buffer completo).
 */
async function proxyImage(res: VercelResponse, imageUrl: string): Promise<void> {
  const upstream = await fetch(imageUrl)
  if (!upstream.ok) throw new Error(`fetch de imagen falló: ${upstream.status}`)
  const buffer = Buffer.from(await upstream.arrayBuffer())
  const contentType = upstream.headers.get('content-type') || DEFAULT_CONTENT_TYPE
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', String(buffer.length))
  res.status(200).send(buffer)
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
        const signed = await signedCoverUrl(meta.coverPath)
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

  // Cache en el CDN: la portada cambia poco; revalida en segundo plano. Como
  // ahora servimos los BYTES (no una redirección), el CDN cachea la imagen en
  // sí — el crawler ni siquiera vuelve a tocar Supabase en visitas repetidas.
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  )

  try {
    await proxyImage(res, target)
  } catch (err) {
    console.error('[api/og] fallo trayendo la portada, usando imagen de marca', {
      kind,
      code,
      err,
    })
    if (target !== fallbackUrl) {
      try {
        await proxyImage(res, fallbackUrl)
        return
      } catch (fallbackErr) {
        console.error('[api/og] fallo también trayendo la imagen de marca', {
          kind,
          code,
          err: fallbackErr,
        })
      }
    }
    // Red de seguridad final de P0: si hasta la imagen de marca falla, no
    // dejamos que la función explote — devolvemos 200 vacío antes que un 500.
    try {
      res.status(200).send('')
    } catch (finalErr) {
      console.error('[api/og] fallo inesperado sirviendo la respuesta final', {
        kind,
        code,
        err: finalErr,
      })
    }
  }
}
