import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del import dinámico de exifr: exif.ts hace `(await import('exifr')).default`
// y usa `exifr.gps(file)` / `exifr.parse(file, [...])`. Controlamos lo que
// devuelven en cada caso.
const gps = vi.fn()
const parse = vi.fn()

vi.mock('exifr', () => ({
  default: { gps, parse },
}))

import { readGpsFromExif, readPhotoMetaFromExif } from './exif'

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

describe('readPhotoMetaFromExif', () => {
  test('con fecha (DateTimeOriginal) y GPS plausible: devuelve los tres campos', async () => {
    parse.mockResolvedValue({ DateTimeOriginal: new Date('2026-06-01T10:30:00.000Z') })
    gps.mockResolvedValue({ latitude: 40.4168, longitude: -3.7038 })
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({
      takenAt: '2026-06-01T10:30:00.000Z',
      lat: 40.4168,
      lng: -3.7038,
    })
  })

  test('sin DateTimeOriginal, usa CreateDate', async () => {
    parse.mockResolvedValue({ CreateDate: new Date('2026-05-20T08:00:00.000Z') })
    gps.mockResolvedValue(undefined)
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({
      takenAt: '2026-05-20T08:00:00.000Z',
      lat: null,
      lng: null,
    })
  })

  test('sin EXIF de fecha ni GPS: los tres campos a null', async () => {
    parse.mockResolvedValue({})
    gps.mockResolvedValue(undefined)
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({ takenAt: null, lat: null, lng: null })
  })

  test('GPS no plausible (Null Island): lat/lng a null igualmente', async () => {
    parse.mockResolvedValue({})
    gps.mockResolvedValue({ latitude: 0, longitude: 0 })
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({ takenAt: null, lat: null, lng: null })
  })

  test('nunca lanza: si exifr.parse falla, sigue devolviendo el GPS si lo hay', async () => {
    parse.mockRejectedValue(new Error('formato raro'))
    gps.mockResolvedValue({ latitude: 40.4, longitude: -3.7 })
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({
      takenAt: null,
      lat: 40.4,
      lng: -3.7,
    })
  })

  test('nunca lanza: si exifr.gps falla, sigue devolviendo la fecha si la hay', async () => {
    parse.mockResolvedValue({ DateTimeOriginal: new Date('2026-06-01T10:30:00.000Z') })
    gps.mockRejectedValue(new Error('formato raro'))
    expect(await readPhotoMetaFromExif(fakeFile)).toEqual({
      takenAt: '2026-06-01T10:30:00.000Z',
      lat: null,
      lng: null,
    })
  })
})
