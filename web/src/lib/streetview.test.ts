import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del SDK global de Google Maps: streetview.ts pide la librería con
// google.maps.importLibrary('streetView') y usa StreetViewService.getPanorama.
const getPanorama = vi.fn()

const StreetViewService = vi.fn(() => ({ getPanorama }))

const importLibrary = vi.fn(async () => ({
  StreetViewService,
  StreetViewPreference: { NEAREST: 'nearest', BEST: 'best' },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error: inyectamos un global google mínimo para el test.
  globalThis.google = { maps: { importLibrary } }
})

import { findPanorama, findPanoramaNear } from './streetview'

describe('findPanorama', () => {
  test('devuelve panoId y la posición encajada al panorama', async () => {
    getPanorama.mockResolvedValue({
      data: {
        location: {
          pano: 'PANO123',
          latLng: { lat: () => 40.4168, lng: () => -3.7038 },
        },
      },
    })

    const out = await findPanorama(40.4, -3.7)
    expect(out).toEqual({ panoId: 'PANO123', lat: 40.4168, lng: -3.7038 })

    // Usa el radio por defecto (80) y la preferencia NEAREST.
    const req = getPanorama.mock.calls[0][0]
    expect(req.location).toEqual({ lat: 40.4, lng: -3.7 })
    expect(req.radius).toBe(80)
    expect(req.preference).toBe('nearest')
  })

  test('respeta el radio personalizado', async () => {
    getPanorama.mockResolvedValue({
      data: { location: { pano: 'P', latLng: { lat: () => 1, lng: () => 2 } } },
    })
    await findPanorama(1, 2, 200)
    expect(getPanorama.mock.calls[0][0].radius).toBe(200)
  })

  test('devuelve null si no hay cobertura (getPanorama rechaza con ZERO_RESULTS)', async () => {
    getPanorama.mockRejectedValue(new Error('ZERO_RESULTS'))
    const out = await findPanorama(0, 0)
    expect(out).toBeNull()
  })

  test('devuelve null si la respuesta no trae panorama', async () => {
    getPanorama.mockResolvedValue({ data: { location: null } })
    const out = await findPanorama(0, 0)
    expect(out).toBeNull()
  })
})

describe('findPanoramaNear', () => {
  test('usa radio 50 m por defecto (criterio del flujo Fácil)', async () => {
    getPanorama.mockResolvedValue({
      data: { location: { pano: 'P', latLng: { lat: () => 40.4, lng: () => -3.7 } } },
    })
    await findPanoramaNear(40.4, -3.7)
    expect(getPanorama.mock.calls[0][0].radius).toBe(50)
  })

  test('reporta la distancia en metros entre el punto y el panorama encajado', async () => {
    // Panorama en el MISMO punto: distancia 0 m.
    getPanorama.mockResolvedValue({
      data: { location: { pano: 'P', latLng: { lat: () => 40.4, lng: () => -3.7 } } },
    })
    const out = await findPanoramaNear(40.4, -3.7)
    expect(out).toEqual({ panoId: 'P', lat: 40.4, lng: -3.7, distanceMeters: 0 })
  })

  test('calcula una distancia > 0 cuando el panorama cae a unos metros', async () => {
    // ~111 m al norte (0.001° de latitud ≈ 111 m).
    getPanorama.mockResolvedValue({
      data: { location: { pano: 'P', latLng: { lat: () => 40.401, lng: () => -3.7 } } },
    })
    const out = await findPanoramaNear(40.4, -3.7)
    expect(out?.distanceMeters).toBeGreaterThan(100)
    expect(out?.distanceMeters).toBeLessThan(120)
  })

  test('null si no hay cobertura en el radio', async () => {
    getPanorama.mockRejectedValue(new Error('ZERO_RESULTS'))
    expect(await findPanoramaNear(0, 0)).toBeNull()
  })
})
