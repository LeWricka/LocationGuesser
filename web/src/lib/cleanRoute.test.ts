import { describe, test, expect, beforeEach, vi } from 'vitest'

// El cliente de Supabase no se toca en estos casos (ruta de viaje y no-ops), pero
// cleanRoute lo importa; lo mockeamos para no abrir conexión en el test.
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  },
}))

import { applyCleanRoute } from './cleanRoute'

function setUrl(pathname: string, hash = ''): void {
  window.history.replaceState(null, '', `${pathname}${hash}`)
}

describe('applyCleanRoute', () => {
  beforeEach(() => {
    setUrl('/')
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
})
