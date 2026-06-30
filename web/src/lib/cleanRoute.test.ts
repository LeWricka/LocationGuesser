import { describe, test, expect, beforeEach, vi } from 'vitest'

// El cliente de Supabase no se toca en estos casos (ruta de viaje y no-ops), pero
// cleanRoute lo importa; lo mockeamos para no abrir conexión en el test. `auth`
// resuelve sin sesión (la recepción del enlace consulta getSession).
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}))

const trackMock = vi.fn()
vi.mock('./analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import { applyCleanRoute } from './cleanRoute'

function setUrl(pathname: string, hash = ''): void {
  window.history.replaceState(null, '', `${pathname}${hash}`)
}

describe('applyCleanRoute', () => {
  beforeEach(() => {
    setUrl('/')
    trackMock.mockClear()
  })

  test('/v/<code> se reescribe a #g=<code>', async () => {
    setUrl('/v/abc123')
    await applyCleanRoute()
    expect(window.location.hash).toBe('#g=abc123')
  })

  test('codifica el code en el hash', async () => {
    setUrl('/v/a%20b')
    await applyCleanRoute()
    expect(window.location.hash).toBe('#g=a%20b')
  })

  test('no toca una URL que ya trae hash (enlace viejo #g=)', async () => {
    setUrl('/', '#g=viejo&c=reto')
    await applyCleanRoute()
    expect(window.location.hash).toBe('#g=viejo&c=reto')
  })

  test('no toca una ruta que no es limpia', async () => {
    setUrl('/cualquier-cosa')
    await applyCleanRoute()
    expect(window.location.hash).toBe('')
  })

  test('/j/<code> sin grupo resoluble cae a #c=<code>', async () => {
    setUrl('/j/reto-1')
    await applyCleanRoute()
    // El mock devuelve data:null → no resuelve grupo → hash de solo reto.
    expect(window.location.hash).toBe('#c=reto-1')
  })

  test('mide share_link_opened (trip) al aterrizar por /v/<code>', async () => {
    setUrl('/v/abc123')
    await applyCleanRoute()
    expect(trackMock).toHaveBeenCalledWith('share_link_opened', {
      kind: 'trip',
      has_session: false,
    })
  })

  test('mide share_link_opened (challenge) al aterrizar por /j/<code>', async () => {
    setUrl('/j/reto-1')
    await applyCleanRoute()
    expect(trackMock).toHaveBeenCalledWith('share_link_opened', {
      kind: 'challenge',
      has_session: false,
    })
  })

  test('mide share_link_opened en un enlace VIEJO con hash de reto (#g=&c=)', async () => {
    setUrl('/', '#g=viejo&c=reto')
    await applyCleanRoute()
    // No reescribe el hash (enlace viejo manda), pero SÍ mide la recepción.
    expect(window.location.hash).toBe('#g=viejo&c=reto')
    await Promise.resolve()
    expect(trackMock).toHaveBeenCalledWith('share_link_opened', {
      kind: 'challenge',
      has_session: false,
    })
  })

  test('un hash interno (#nuevo) NO es recepción y no se mide', async () => {
    setUrl('/', '#nuevo')
    await applyCleanRoute()
    await Promise.resolve()
    expect(trackMock).not.toHaveBeenCalled()
  })
})
