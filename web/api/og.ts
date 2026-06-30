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

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveMeta, signedCoverUrl, type ShareKind } from './_meta'

// Imagen de marca por defecto (en /public): se usa cuando el viaje/reto no tiene
// foto o no se puede firmar la portada. Así la tarjeta NUNCA queda sin imagen.
const FALLBACK_IMAGE = '/og-default.png'

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
  } catch {
    // Cualquier fallo (red, credenciales): caemos a la imagen de marca.
    target = fallbackUrl
  }

  // Cache en el CDN: la portada cambia poco; revalida en segundo plano. La propia
  // redirección se cachea para no re-firmar en cada visita del crawler.
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  )
  res.redirect(302, target)
}
