// Tests del handler `api/og` (imagen OG: sirve los BYTES de la portada real
// firmada o, si falla, los de la imagen de marca — nunca una redirección, ver
// el porqué del bug #958 en la cabecera de `og.ts`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function makeReq(
  query: Record<string, string>,
  headers: Record<string, string> = {},
): VercelRequest {
  return { query, headers } as unknown as VercelRequest
}

type TestRes = VercelResponse & {
  _status: number | null
  _body: string | Buffer
  _headers: Record<string, string>
}

function makeRes(): TestRes {
  const res: Partial<TestRes> = {
    _status: null,
    _body: '',
    _headers: {},
  }
  res.setHeader = ((key: string, value: string) => {
    res._headers![key] = value
    return res
  }) as unknown as TestRes['setHeader']
  res.status = ((code: number) => {
    res._status = code
    return res
  }) as unknown as TestRes['status']
  res.send = ((body: string | Buffer) => {
    res._body = body
    return res
  }) as unknown as TestRes['send']
  return res as TestRes
}

const ORIGINAL_ENV = { ...process.env }

/** Respuesta `fetch` con bytes de imagen, para simular el origen (Storage o marca). */
function imageResponse(bytes = 'foto-real', contentType = 'image/jpeg'): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': contentType } })
}

describe('api/og handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('el módulo carga SIN ninguna env de servidor (no lanza al importarse) y sirve la imagen de marca (200)', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe('https://www.momentu.art/og-default.png')
        return imageResponse('marca', 'image/png')
      }),
    )

    const mod = await import('./og.ts')
    expect(typeof mod.default).toBe('function')

    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()
    await expect(mod.default(req, res)).resolves.toBeUndefined()
    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('image/png')
    expect(res._body?.toString()).toBe('marca')
  })

  it('happy path: código válido con portada sirve los BYTES de la URL firmada, NUNCA una redirección (bug #958)', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        // El GET que trae los BYTES de la URL firmada comparte el prefijo con el
        // endpoint de FIRMA (POST): hay que mirar primero el `token=` (más
        // específico) para no confundir ambas llamadas.
        if (url.includes('token=abc')) {
          return imageResponse('foto-real-del-viaje', 'image/jpeg')
        }
        if (url.includes('/storage/v1/object/sign/images/')) {
          expect(init?.method).toBe('POST')
          return new Response(
            JSON.stringify({ signedURL: '/object/sign/images/grupo-1/foto.jpg?token=abc' }),
            { status: 200 },
          )
        }
        if (url.includes('/rest/v1/groups')) {
          return new Response(
            JSON.stringify([{ id: 'grupo-1', name: 'Ruta por Japón', created_by: null }]),
            { status: 200 },
          )
        }
        if (url.includes('/rest/v1/challenges')) {
          return new Response(JSON.stringify([{ image_path: 'grupo-1/foto.jpg' }]), {
            status: 200,
          })
        }
        return new Response('[]', { status: 200 })
      }),
    )

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('image/jpeg')
    expect(res._body?.toString()).toBe('foto-real-del-viaje')
    expect(res._headers['Content-Length']).toBe(String('foto-real-del-viaje'.length))
  })

  it('degradación: si resolveMeta/firma falla, sirve la imagen de marca (200), nunca 500 ni redirección', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'https://www.momentu.art/og-default.png') {
          return imageResponse('marca', 'image/png')
        }
        throw new Error('network down')
      }),
    )

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('image/png')
    expect(res._body?.toString()).toBe('marca')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('degradación: la URL firmada resuelve pero el fetch de sus bytes falla (p.ej. 404) → cae a la imagen de marca', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // Ver comentario del happy path: el `token=` va antes del prefijo
        // genérico de firma, porque ambas URLs lo comparten.
        if (url.includes('token=abc')) {
          return new Response('not found', { status: 404 })
        }
        if (url.includes('/storage/v1/object/sign/images/')) {
          return new Response(
            JSON.stringify({ signedURL: '/object/sign/images/grupo-1/foto.jpg?token=abc' }),
            { status: 200 },
          )
        }
        if (url.includes('/rest/v1/groups')) {
          return new Response(
            JSON.stringify([{ id: 'grupo-1', name: 'Ruta por Japón', created_by: null }]),
            { status: 200 },
          )
        }
        if (url.includes('/rest/v1/challenges')) {
          return new Response(JSON.stringify([{ image_path: 'grupo-1/foto.jpg' }]), {
            status: 200,
          })
        }
        if (url === 'https://www.momentu.art/og-default.png') {
          return imageResponse('marca', 'image/png')
        }
        return new Response('[]', { status: 200 })
      }),
    )

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toBe('image/png')
    expect(res._body?.toString()).toBe('marca')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('degradación: sin credenciales de servidor, sirve la imagen de marca sin tocar Supabase', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const fetchSpy = vi.fn(async (url: string) => {
      expect(url).toBe('https://www.momentu.art/og-default.png')
      return imageResponse('marca', 'image/png')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body?.toString()).toBe('marca')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('red de seguridad final: si hasta la imagen de marca falla al traer, responde 200 vacío en vez de dejar la excepción sin capturar', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('CDN caído también para la imagen de marca')
      }),
    )

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await expect(handler(req, res)).resolves.toBeUndefined()
    expect(res._status).toBe(200)
    expect(res._body).toBe('')
  })
})
