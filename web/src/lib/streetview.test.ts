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

import { findPanorama } from './streetview'

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
