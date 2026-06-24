import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del import dinámico de exifr: exif.ts hace `(await import('exifr')).default`
// y usa `exifr.gps(file)`. Controlamos lo que devuelve gps en cada caso.
const gps = vi.fn()

vi.mock('exifr', () => ({
  default: { gps },
}))

import { readGpsFromExif } from './exif'

// Un File de pega; readGpsFromExif solo se lo pasa a exifr (mockeado), no lo lee.
const fakeFile = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readGpsFromExif', () => {
  test('devuelve lat/lng cuando el EXIF trae GPS plausible', async () => {
    gps.mockResolvedValue({ latitude: 40.4168, longitude: -3.7038 })
    expect(await readGpsFromExif(fakeFile)).toEqual({ lat: 40.4168, lng: -3.7038 })
  })

  test('null si la foto no tiene bloque GPS (exifr devuelve undefined)', async () => {
    gps.mockResolvedValue(undefined)
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })

  test('null si falta latitude o longitude', async () => {
    gps.mockResolvedValue({ latitude: 40.4 })
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })

  test('null en Null Island (0,0): GPS sin fix, no una ubicación real', async () => {
    gps.mockResolvedValue({ latitude: 0, longitude: 0 })
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })

  test('null si las coordenadas están fuera de rango', async () => {
    gps.mockResolvedValue({ latitude: 200, longitude: 500 })
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })

  test('null si las coordenadas no son finitas (NaN)', async () => {
    gps.mockResolvedValue({ latitude: NaN, longitude: 10 })
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })

  test('null sin romper si exifr lanza (formato raro / no-imagen)', async () => {
    gps.mockRejectedValue(new Error('unsupported file'))
    expect(await readGpsFromExif(fakeFile)).toBeNull()
  })
})
