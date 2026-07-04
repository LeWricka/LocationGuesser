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

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  resolveMeta,
  ogHeadline,
  ogDescription,
  ogEyebrow,
  type ShareKind,
  type ShareMeta,
} from './_meta'

const SITE_NAME = 'Momentu'

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
    } catch {
      // Fallo de red/credenciales: caemos a metas genéricas (la app sigue abriendo).
      meta = null
    }
  }

  // Cache moderada en el CDN: la tarjeta cambia poco (título/portada) y conviene que
  // el crawler la sirva rápido. stale-while-revalidate refresca en segundo plano.
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
  res.status(200).send(buildHtml(origin, kind, code, meta))
}
