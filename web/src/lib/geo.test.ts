import { describe, test, expect } from 'vitest'
import { haversine, scoreFor, fmtDist, SCORE_DECAY_KM, DEFAULT_SCORE_SCALE } from './geo'

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

  // ── Precisión del reto (score_scale → D) ──────────────────────────────────
  test('scoreFor: por defecto es "mundo" = el comportamiento histórico (D=2000)', () => {
    // Sin escala == escala 'mundo' == la fórmula de siempre 5000·e^(−km/2000).
    expect(DEFAULT_SCORE_SCALE).toBe('mundo')
    for (const km of [0, 50, 500, 2000, 9000]) {
      expect(scoreFor(km)).toBe(scoreFor(km, 'mundo'))
      expect(scoreFor(km, 'mundo')).toBe(Math.round(5000 * Math.exp(-km / 2000)))
    }
  })

  test('scoreFor: a 0 km todas las escalas dan el máximo (5000)', () => {
    expect(scoreFor(0, 'mundo')).toBe(5000)
    expect(scoreFor(0, 'pais')).toBe(5000)
    expect(scoreFor(0, 'ciudad')).toBe(5000)
    expect(scoreFor(0, 'barrio')).toBe(5000)
  })

  test('scoreFor: a igual distancia, más estricto = menos puntos (barrio<ciudad<pais<mundo)', () => {
    const km = 20 // misma distancia, distinta exigencia
    expect(scoreFor(km, 'barrio')).toBeLessThan(scoreFor(km, 'ciudad'))
    expect(scoreFor(km, 'ciudad')).toBeLessThan(scoreFor(km, 'pais'))
    expect(scoreFor(km, 'pais')).toBeLessThan(scoreFor(km, 'mundo'))
  })

  test('scoreFor: cada escala usa su D (5000·e^(−km/D))', () => {
    const km = 10
    for (const scale of ['mundo', 'pais', 'ciudad', 'barrio'] as const) {
      expect(scoreFor(km, scale)).toBe(Math.round(5000 * Math.exp(-km / SCORE_DECAY_KM[scale])))
    }
  })

  test('fmtDist: metros, decimales y enteros', () => {
    expect(fmtDist(0.5)).toBe('500 m')
    expect(fmtDist(12.34)).toBe('12.3 km')
    expect(fmtDist(1500)).toBe('1500 km')
  })
})
