import { describe, test, expect, vi, afterEach } from 'vitest'
import { searchPlaces } from './geocode'

// Respuesta mínima de Nominatim para no pegar a la red real en los tests.
function mockSearch(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('searchPlaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('parsea resultados: nombre corto + detalle a partir de display_name', async () => {
    const fetchMock = mockSearch([
      { lat: '4.710989', lon: '-74.072092', display_name: 'Bogotá, Colombia' },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const out = await searchPlaces('Bogotá')
    expect(out).toEqual([{ lat: 4.710989, lng: -74.072092, name: 'Bogotá', detail: 'Colombia' }])
  })

  test('detail vacío si display_name no tiene más tramos', async () => {
    const fetchMock = mockSearch([{ lat: '1', lon: '2', display_name: 'Solo' }])
    vi.stubGlobal('fetch', fetchMock)

    const out = await searchPlaces('solo')
    expect(out).toEqual([{ lat: 1, lng: 2, name: 'Solo', detail: '' }])
  })

  test('respeta el límite pedido en la query string', async () => {
    const fetchMock = mockSearch([])
    vi.stubGlobal('fetch', fetchMock)

    await searchPlaces('Roma', { limit: 3 })
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('limit=3')
    expect(calledUrl).toContain('q=Roma')
  })

  test('usa el idioma pedido en accept-language', async () => {
    const fetchMock = mockSearch([])
    vi.stubGlobal('fetch', fetchMock)

    await searchPlaces('Roma', { lang: 'en' })
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('accept-language=en')
  })

  test('query vacía o solo espacios → [] sin llamar a la red', async () => {
    const fetchMock = mockSearch([])
    vi.stubGlobal('fetch', fetchMock)

    expect(await searchPlaces('')).toEqual([])
    expect(await searchPlaces('   ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('devuelve [] y no lanza si la respuesta no es ok', async () => {
    const fetchMock = mockSearch([], false)
    vi.stubGlobal('fetch', fetchMock)

    expect(await searchPlaces('nada')).toEqual([])
  })

  test('devuelve [] y no lanza si fetch rechaza (red caída)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    expect(await searchPlaces('nada')).toEqual([])
  })

  test('devuelve [] si el JSON no es un array', async () => {
    const fetchMock = mockSearch({ error: 'algo' })
    vi.stubGlobal('fetch', fetchMock)

    expect(await searchPlaces('nada')).toEqual([])
  })

  test('ignora resultados con lat/lon no numéricos', async () => {
    const fetchMock = mockSearch([
      { lat: 'nope', lon: '2', display_name: 'Roto' },
      { lat: '1', lon: '2', display_name: 'Bueno, España' },
    ])
    vi.stubGlobal('fetch', fetchMock)

    const out = await searchPlaces('roto')
    expect(out).toEqual([{ lat: 1, lng: 2, name: 'Bueno', detail: 'España' }])
  })
})
