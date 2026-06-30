import { describe, test, expect } from 'vitest'
import { computeResult } from './result'

describe('computeResult', () => {
  test('mismo punto: 0 km y máximo de puntos', () => {
    const p = { lat: 40, lng: -3 }
    const { km, points } = computeResult(p, p)
    expect(km).toBeCloseTo(0)
    expect(points).toBe(5000)
  })

  test('Madrid–París: ~1050 km y puntos < máximo pero > 0', () => {
    const madrid = { lat: 40.4168, lng: -3.7038 }
    const paris = { lat: 48.8566, lng: 2.3522 }
    const { km, points } = computeResult(madrid, paris)
    expect(km).toBeGreaterThan(1000)
    expect(km).toBeLessThan(1100)
    expect(points).toBeGreaterThan(0)
    expect(points).toBeLessThan(5000)
  })

  test('puntos coherentes con la fórmula 5000·e^(−km/2000)', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 1 }
    const { km, points } = computeResult(a, b)
    expect(points).toBe(Math.round(5000 * Math.exp(-km / 2000)))
  })

  test('antípodas: distancia enorme y 0 puntos', () => {
    const { km, points } = computeResult({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })
    expect(km).toBeGreaterThan(19000)
    expect(points).toBe(0)
  })

  test('sin escala == "mundo": el cálculo no cambia para los retos de siempre', () => {
    const a = { lat: 40, lng: -3 }
    const b = { lat: 41, lng: -2 }
    expect(computeResult(a, b).points).toBe(computeResult(a, b, 'mundo').points)
  })

  test('una escala más estricta da menos puntos a la misma distancia', () => {
    const a = { lat: 40, lng: -3 }
    const b = { lat: 40.1, lng: -3 } // ~11 km
    expect(computeResult(a, b, 'barrio').points).toBeLessThan(computeResult(a, b, 'mundo').points)
  })
})
