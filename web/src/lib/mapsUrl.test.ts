import { describe, test, expect } from 'vitest'
import { parseLatLngFromText, isShortMapsLink } from './mapsUrl'

describe('parseLatLngFromText', () => {
  test('formato @lat,lng', () => {
    expect(parseLatLngFromText('https://www.google.com/maps/@40.4168,-3.7038,15z')).toEqual({
      lat: 40.4168,
      lng: -3.7038,
    })
  })

  test('formato place con !3d!4d', () => {
    // Google emite !3d<lat>!4d<lng> (3d=lat primero, 4d=lng después).
    expect(
      parseLatLngFromText(
        'https://www.google.com/maps/place/Madrid/data=!3m1!4b1!3d40.4168!4d-3.7038',
      ),
    ).toEqual({ lat: 40.4168, lng: -3.7038 })
  })

  test('query q=', () => {
    expect(parseLatLngFromText('https://maps.google.com/?q=41.3851,2.1734')).toEqual({
      lat: 41.3851,
      lng: 2.1734,
    })
  })

  test('query query=', () => {
    expect(
      parseLatLngFromText('https://www.google.com/maps/search/?api=1&query=48.8584,2.2945'),
    ).toEqual({ lat: 48.8584, lng: 2.2945 })
  })

  test('parametro ll=', () => {
    expect(parseLatLngFromText('https://maps.google.com/?ll=51.5074,-0.1278')).toEqual({
      lat: 51.5074,
      lng: -0.1278,
    })
  })

  test('par lat,lng suelto pegado', () => {
    expect(parseLatLngFromText('40.4168, -3.7038')).toEqual({ lat: 40.4168, lng: -3.7038 })
  })

  test('par sin espacio', () => {
    expect(parseLatLngFromText('-33.8688,151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  test('texto sin coordenadas → null', () => {
    expect(parseLatLngFromText('un sitio cualquiera')).toBeNull()
  })

  test('texto vacío → null', () => {
    expect(parseLatLngFromText('')).toBeNull()
    expect(parseLatLngFromText('   ')).toBeNull()
  })

  test('enlace corto sin coordenadas → null (necesita Edge Function)', () => {
    expect(parseLatLngFromText('https://maps.app.goo.gl/abc123')).toBeNull()
  })

  test('lat fuera de rango → null', () => {
    expect(parseLatLngFromText('@95.0,10.0')).toBeNull()
  })

  test('lng fuera de rango → null', () => {
    expect(parseLatLngFromText('@10.0,200.0')).toBeNull()
  })

  test('prioriza @lat,lng sobre par suelto en la misma URL', () => {
    // La URL trae el centro (@) y luego el destino (!3d!4d); cogemos el primero válido.
    expect(
      parseLatLngFromText('https://www.google.com/maps/@40.0,-3.0,15z/data=!3d41.0!4d2.0'),
    ).toEqual({ lat: 40.0, lng: -3.0 })
  })
})

describe('isShortMapsLink', () => {
  test('maps.app.goo.gl', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/xYz123')).toBe(true)
  })

  test('goo.gl/maps', () => {
    expect(isShortMapsLink('https://goo.gl/maps/xYz123')).toBe(true)
  })

  test('http (sin s)', () => {
    expect(isShortMapsLink('http://maps.app.goo.gl/xYz123')).toBe(true)
  })

  test('URL larga normal → false', () => {
    expect(isShortMapsLink('https://www.google.com/maps/@40.4,-3.7,15z')).toBe(false)
  })

  test('coordenadas sueltas → false', () => {
    expect(isShortMapsLink('40.4,-3.7')).toBe(false)
  })

  test('otro acortador → false', () => {
    expect(isShortMapsLink('https://bit.ly/abc')).toBe(false)
  })
})
