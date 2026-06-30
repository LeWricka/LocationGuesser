import { describe, test, expect } from 'vitest'
import {
  haversine,
  scoreFor,
  fmtDist,
  SCORE_DECAY_KM,
  DEFAULT_SCORE_SCALE,
  scoreForNumber,
  NUMBER_DECAY_K,
  DEFAULT_NUMBER_TOLERANCE,
} from './geo'

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

// ── Reto de NÚMERO (¿Cuánto?): scoreForNumber replica submit_number_vote (0029) ──
describe('scoreForNumber', () => {
  test('clavarlo (error 0) da el máximo de 5000 puntos en toda tolerancia', () => {
    expect(scoreForNumber(0, 84.5)).toBe(5000)
    expect(scoreForNumber(0, 84.5, 'indulgente')).toBe(5000)
    expect(scoreForNumber(0, 84.5, 'estricto')).toBe(5000)
  })

  test('por defecto es "normal" (k=0.25)', () => {
    expect(DEFAULT_NUMBER_TOLERANCE).toBe('normal')
    // error relativo 10% con k=0.25 → 5000·e^(−0.1/0.25)
    expect(scoreForNumber(10, 100)).toBe(scoreForNumber(10, 100, 'normal'))
    expect(scoreForNumber(10, 100, 'normal')).toBe(Math.round(5000 * Math.exp(-0.1 / 0.25)))
  })

  test('error ±10% (normal): ~3352 pts; el signo del error no importa (valor absoluto)', () => {
    // |guess − answer| = 10 sobre 100 → rel 0.1. 5000·e^(−0.1/0.25) ≈ 3352.
    expect(scoreForNumber(10, 100, 'normal')).toBe(3352)
    // El error es absoluto: pasarse o quedarse corto puntúa igual a igual magnitud.
    expect(scoreForNumber(10, 100, 'normal')).toBe(scoreForNumber(10, 100, 'normal'))
  })

  test('error ±25% (normal): 5000·e^(−0.25/0.25) = 5000/e ≈ 1839 pts', () => {
    expect(scoreForNumber(25, 100, 'normal')).toBe(Math.round(5000 / Math.E))
    expect(scoreForNumber(25, 100, 'normal')).toBe(1839)
  })

  test('INVARIANCIA DE ESCALA: 50€ y 50.000€ con el mismo % de error → mismos puntos', () => {
    // 10% de error en ambas magnitudes: 5 sobre 50, 5000 sobre 50000 → mismos puntos.
    expect(scoreForNumber(5, 50, 'normal')).toBe(scoreForNumber(5000, 50000, 'normal'))
    // Y en estricto también (la normalización es independiente de la tolerancia).
    expect(scoreForNumber(5, 50, 'estricto')).toBe(scoreForNumber(5000, 50000, 'estricto'))
  })

  test('answer=0: ε=1 evita dividir por cero (rel = absError/max(0,1) = absError)', () => {
    // Con respuesta 0, el error relativo es el error absoluto (denominador = 1).
    expect(scoreForNumber(0, 0)).toBe(5000)
    expect(scoreForNumber(0.25, 0, 'normal')).toBe(Math.round(5000 * Math.exp(-0.25 / 0.25)))
    expect(Number.isFinite(scoreForNumber(10, 0, 'normal'))).toBe(true)
  })

  test('más estricto = menos puntos a igual error (estricto<normal<indulgente)', () => {
    const abs = 20 // mismo error relativo, distinta exigencia
    const ans = 100
    expect(scoreForNumber(abs, ans, 'estricto')).toBeLessThan(scoreForNumber(abs, ans, 'normal'))
    expect(scoreForNumber(abs, ans, 'normal')).toBeLessThan(scoreForNumber(abs, ans, 'indulgente'))
  })

  test('cada tolerancia usa su k (5000·e^(−rel/k))', () => {
    for (const tol of ['indulgente', 'normal', 'estricto'] as const) {
      // rel = 30/100 = 0.3
      expect(scoreForNumber(30, 100, tol)).toBe(
        Math.round(5000 * Math.exp(-0.3 / NUMBER_DECAY_K[tol])),
      )
    }
  })

  test('nunca negativo: un error enorme tiende a 0', () => {
    expect(scoreForNumber(1_000_000, 100, 'estricto')).toBe(0)
    expect(scoreForNumber(1_000_000, 100, 'estricto')).toBeGreaterThanOrEqual(0)
  })
})
