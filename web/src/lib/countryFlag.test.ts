import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { flagFromCountryCode, countryFromCoords, clearCountryCache } from './countryFlag'

describe('flagFromCountryCode', () => {
  test('mapea códigos válidos a su bandera', () => {
    expect(flagFromCountryCode('MY')).toBe('🇲🇾')
    expect(flagFromCountryCode('ES')).toBe('🇪🇸')
  })

  test('acepta minúsculas y espacios', () => {
    expect(flagFromCountryCode('my')).toBe('🇲🇾')
    expect(flagFromCountryCode(' es ')).toBe('🇪🇸')
  })

  test('devuelve vacío ante código inválido', () => {
    expect(flagFromCountryCode('')).toBe('')
    expect(flagFromCountryCode('E')).toBe('')
    expect(flagFromCountryCode('ESP')).toBe('')
    expect(flagFromCountryCode('E1')).toBe('')
    expect(flagFromCountryCode('--')).toBe('')
  })
})

// Respuesta mínima de Nominatim para no pegar a la red real en los tests.
function mockReverse(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('countryFromCoords', () => {
  beforeEach(() => {
    clearCountryCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('parsea país, código y bandera (nombre en mayúsculas)', async () => {
    const fetchMock = mockReverse({ address: { country: 'Malasia', country_code: 'my' } })
    vi.stubGlobal('fetch', fetchMock)

    const out = await countryFromCoords(3.139, 101.6869)
    expect(out).toEqual({ code: 'MY', name: 'MALASIA', flag: '🇲🇾' })
  })

  test('cachea por coordenada redondeada: no repite el fetch', async () => {
    const fetchMock = mockReverse({ address: { country: 'España', country_code: 'es' } })
    vi.stubGlobal('fetch', fetchMock)

    await countryFromCoords(40.4168, -3.7038)
    // Punto a <0.01° de distancia → misma clave de caché → sin segundo fetch.
    const second = await countryFromCoords(40.4172, -3.7041)

    expect(second).toEqual({ code: 'ES', name: 'ESPAÑA', flag: '🇪🇸' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('devuelve null si no hay país (p.ej. mar abierto)', async () => {
    const fetchMock = mockReverse({ address: {} })
    vi.stubGlobal('fetch', fetchMock)

    expect(await countryFromCoords(0, 0)).toBeNull()
  })

  test('devuelve null y no lanza si la respuesta no es ok', async () => {
    const fetchMock = mockReverse({}, false)
    vi.stubGlobal('fetch', fetchMock)

    expect(await countryFromCoords(10, 10)).toBeNull()
  })

  test('devuelve null y no lanza si fetch rechaza', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    expect(await countryFromCoords(20, 20)).toBeNull()
  })

  test('cachea el fallo: no reintenta un punto que ya falló', async () => {
    const fetchMock = mockReverse({ address: {} })
    vi.stubGlobal('fetch', fetchMock)

    await countryFromCoords(50, 50)
    await countryFromCoords(50, 50)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
