import { describe, test, expect } from 'vitest'
import { haversine, scoreFor, fmtDist } from './geo'

describe('geo', () => {
  test('haversine: mismo punto = 0 km', () => {
    expect(haversine({ lat: 40, lng: -3 }, { lat: 40, lng: -3 })).toBeCloseTo(0)
  })

  test('haversine: Madrid–París ≈ 1050 km', () => {
    const madrid = { lat: 40.4168, lng: -3.7038 }
    const paris = { lat: 48.8566, lng: 2.3522 }
    const km = haversine(madrid, paris)
    expect(km).toBeGreaterThan(1000)
    expect(km).toBeLessThan(1100)
  })

  test('scoreFor: 0 km da el máximo de 5000 puntos', () => {
    expect(scoreFor(0)).toBe(5000)
  })

  test('scoreFor: decrece con la distancia y nunca es negativo', () => {
    expect(scoreFor(2000)).toBeLessThan(scoreFor(0))
    expect(scoreFor(100000)).toBe(0)
  })

  test('fmtDist: metros, decimales y enteros', () => {
    expect(fmtDist(0.5)).toBe('500 m')
    expect(fmtDist(12.34)).toBe('12.3 km')
    expect(fmtDist(1500)).toBe('1500 km')
  })
})
