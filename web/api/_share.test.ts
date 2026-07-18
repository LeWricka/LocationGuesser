// Tests del handler `api/share` (previsualización OG de /v/:code y /j/:code).
//
// Contexto del P0 (500 FUNCTION_INVOCATION_FAILED al abrir un enlace compartido):
// el crash era a NIVEL DE CARGA DE MÓDULO — `@vercel/node` compila con
// `ts.transpileModule` (no bundlea) y renombra `.ts`→`.js`, pero deja los
// especificadores de import verbatim, así que `import … from './_meta.ts'`
// apuntaba a un fichero inexistente en runtime → `ERR_MODULE_NOT_FOUND` ANTES de
// ejecutar el handler (ningún try/catch del handler lo captura). El fix: `share.ts`
// es AUTOCONTENIDO (sin imports relativos) → no hay nada que resolver → el módulo
// SIEMPRE carga. Un unit test no reproduce el fallo de Vercel (Vitest resuelve
// TS), pero el test "el módulo carga sin ninguna env" abajo blinda la propiedad
// que importa (importarlo nunca lanza), y el resto verifica la degradación: pase
// lo que pase, el handler responde 200, nunca un 500.
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
  res.send = ((body: string) => {
    res._body = body
    return res
  }) as unknown as TestRes['send']
  return res as TestRes
}

const ORIGINAL_ENV = { ...process.env }

describe('api/share handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('el módulo carga SIN ninguna env de servidor (no lanza al importarse) y el handler responde 200', async () => {
    // Reproduce el estado de Vercel hoy: sin SUPABASE_URL/KEY de servidor. El
    // fichero autocontenido no debe tener NADA a nivel de módulo que dependa de
    // esas env, así que importarlo no puede lanzar (era la causa raíz del 500).
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const mod = await import('./share.ts')
    expect(typeof mod.default).toBe('function')

    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()
    await expect(mod.default(req, res)).resolves.toBeUndefined()
    expect(res._status).toBe(200)
    expect(res._body).toContain('#g=grupo-1')
  })

  it('happy path: código válido devuelve 200 con metas del viaje y redirección al hash', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rest/v1/groups')) {
          return new Response(
            JSON.stringify([{ id: 'grupo-1', name: 'Ruta por Japón', created_by: 'user-1' }]),
            { status: 200 },
          )
        }
        if (url.includes('/rest/v1/profiles')) {
          return new Response(JSON.stringify([{ display_name: 'Lewis' }]), { status: 200 })
        }
        if (url.includes('/rest/v1/challenges')) {
          return new Response(JSON.stringify([{ image_path: 'grupo-1/foto.jpg' }]), { status: 200 })
        }
        return new Response('[]', { status: 200 })
      }),
    )

    const { default: handler } = await import('./share.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toContain('Vive el viaje de Lewis en el mapa')
    expect(res._body).toContain('#g=grupo-1')
    expect(res._body).toContain('og:image')
  })

  it('degradación: si resolveMeta falla (Supabase caído), NO devuelve 500 — sirve metas genéricas y redirige igual', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('./share.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toContain('Momentu')
    expect(res._body).toContain('#g=grupo-1')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('degradación: sin credenciales de servidor, sirve metas genéricas sin tocar red', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { default: handler } = await import('./share.ts')
    const req = makeReq({ kind: 'challenge', code: 'reto-1' }, { host: 'www.momentu.art' })
    const res = makeRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toContain('#c=reto-1')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('red de seguridad final: si buildHtml lanzara igualmente, el handler responde 200 con redirect mínimo, nunca deja el error sin capturar', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: handler } = await import('./share.ts')
    const req = makeReq({ kind: 'trip', code: 'grupo-1' }, { host: 'www.momentu.art' })
    const res = makeRes()
    // Forzamos el fallo del camino "feliz" de `res.status(...).send(...)` para
    // ejercitar el catch de última línea (nunca debe propagar la excepción).
    const originalStatus = res.status.bind(res)
    let calls = 0
    res.status = ((code: number) => {
      calls += 1
      if (calls === 1) {
        throw new Error('fallo inesperado construyendo la respuesta')
      }
      return originalStatus(code)
    }) as unknown as TestRes['status']

    await expect(handler(req, res)).resolves.toBeUndefined()
    expect(res._status).toBe(200)
    expect(res._body).toContain('#g=grupo-1')
  })
})
