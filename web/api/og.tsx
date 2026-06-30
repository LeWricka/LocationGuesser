// Imagen OG dinámica (1200×630) de un viaje/reto, generada en el EDGE de Vercel
// con `@vercel/og` (Satori + resvg-wasm: sin dependencias nativas). Compone la
// PORTADA real del viaje/reto + un sello "Lugares" + el título en serif + una
// pastilla con el gancho. La foto es lo que da CONFIANZA (la maqueta compartir.html
// insiste en ello): se reconoce un sitio real y quién comparte.
//
// La portada vive en el bucket PRIVADO `images`; la firmamos con el service role
// (que salta la RLS, migración 0025) para poder descargarla aquí. Si no hay foto o
// falla la firma, caemos a un fondo de marca degradado (la tarjeta sigue siendo
// digna). Cache agresiva en el CDN: la imagen cambia poco.

import { ImageResponse } from '@vercel/og'
import { resolveMeta, signedCoverUrl, ogEyebrow, type ShareKind, type ShareMeta } from './_meta'

export const config = { runtime: 'edge' }

const WIDTH = 1200
const HEIGHT = 630

// Paleta de marca (tokens "Atelier").
const INK = '#34506b'
const PAPER = '#f6f7f9'
const GOLD = '#c8a24a'

function pill(meta: ShareMeta): string {
  return meta.kind === 'challenge' ? '🎯 Adivina en el mapa' : '📍 Mira cada parada'
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const kind: ShareKind = url.searchParams.get('kind') === 'challenge' ? 'challenge' : 'trip'
  const code = url.searchParams.get('code') ?? ''

  let meta: ShareMeta | null = null
  try {
    if (code) meta = await resolveMeta(kind, code)
  } catch {
    meta = null
  }

  const eyebrow = meta ? ogEyebrow(meta) : 'Lugares'
  const title = meta?.title ?? 'Lugares'
  const tag = meta ? pill(meta) : '📍 Comparte tus viajes'

  // URL firmada de la portada (descargable por Satori). Null → fondo degradado.
  let coverUrl: string | null = null
  if (meta?.coverPath) {
    try {
      coverUrl = await signedCoverUrl(meta.coverPath)
    } catch {
      coverUrl = null
    }
  }

  const background = coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundImage: `linear-gradient(135deg, ${INK} 0%, #25384d 100%)` }

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        width: '100%',
        height: '100%',
        ...background,
      }}
    >
      {/* Velo oscuro inferior para que el texto blanco siempre lea sobre la foto. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          justifyContent: 'space-between',
          backgroundImage:
            'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)',
          padding: 56,
        }}
      >
        {/* Sello de marca arriba. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: PAPER,
              color: INK,
              borderRadius: 999,
              padding: '12px 22px',
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            <span style={{ color: GOLD, fontSize: 34 }}>◆</span> Lugares
          </div>
        </div>

        {/* Bloque inferior: quién comparte + título + pastilla. */}
        <div style={{ display: 'flex', flexDirection: 'column', color: '#fff' }}>
          <div style={{ display: 'flex', fontSize: 30, opacity: 0.92, marginBottom: 8 }}>
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              marginBottom: 24,
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                background: meta?.kind === 'challenge' ? GOLD : 'rgba(255,255,255,0.18)',
                color: '#fff',
                borderRadius: 999,
                padding: '12px 24px',
                fontSize: 30,
                fontWeight: 600,
              }}
            >
              {tag}
            </div>
          </div>
        </div>
      </div>
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Cache agresiva en el CDN: la portada/título cambian poco; revalida en background.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
