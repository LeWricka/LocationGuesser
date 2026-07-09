// Tests del handler `api/og` (imagen OG: redirige a la portada real firmada o,
// si falla, a la imagen de marca). Ver `share.test.ts` para el contexto del
// bug de P0 (import sin extensión) que rompía TODA invocación en prod.
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
  _body: string
  _headers: Record<string, string>
  _redirect: { code: number; url: string } | null
}

function makeRes(): TestRes {
  const res: Partial<TestRes> = {
    _status: null,
    _body: '',
    _headers: {},
    _redirect: null,
  }
  res.setHeader = ((key: string, value: string) => {
    res._headers![key] = value
    return res
  }) as unknown as TestRes['setHeader']
  res.status = ((code: number) => {
    res._status = code
    return res
  }) as unknown as TestRes['status']
  res.send = ((body: string) => {
    res._body = body
    return res
  }) as unknown as TestRes['send']
  res.redirect = ((codeOrUrl: number | string, maybeUrl?: string) => {
    if (typeof codeOrUrl === 'number') {
      res._redirect = { code: codeOrUrl, url: maybeUrl ?? '' }
    } else {
      res._redirect = { code: 302, url: codeOrUrl }
    }
    return res
  }) as unknown as TestRes['redirect']
  return res as TestRes
}

const ORIGINAL_ENV = { ...process.env }

describe('api/og handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('happy path: código válido con portada redirige a la URL firmada del bucket', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
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
          return new Response(JSON.stringify([{ image_path: 'grupo-1/foto.jpg' }]), { status: 200 })
        }
        if (url.includes('/storage/v1/object/sign/images/')) {
          return new Response(
            JSON.stringify({ signedURL: '/object/sign/images/grupo-1/foto.jpg?token=abc' }),
            { status: 200 },
          )
        }
        return new Response('[]', { status: 200 })
      }),
    )

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._redirect?.code).toBe(302)
    expect(res._redirect?.url).toContain('/storage/v1/object/sign/images/grupo-1/foto.jpg')
  })

  it('degradación: si resolveMeta/firma falla, redirige a la imagen de marca por defecto, nunca 500', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._redirect?.code).toBe(302)
    expect(res._redirect?.url).toBe('https://www.momentu.art/og-default.png')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('degradación: sin credenciales de servidor, redirige directo a la imagen de marca sin tocar red', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._redirect?.code).toBe(302)
    expect(res._redirect?.url).toBe('https://www.momentu.art/og-default.png')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('red de seguridad final: si incluso res.redirect fallara, responde 200 en vez de dejar la excepción sin capturar', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('./og.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()
    res.redirect = (() => {
      throw new Error('fallo inesperado en redirect')
    }) as unknown as TestRes['redirect']

    await expect(handler(req, res)).resolves.toBeUndefined()
    expect(res._status).toBe(200)
  })
})
