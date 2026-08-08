import { describe, test, expect } from 'vitest'
import {
  haversine,
  scoreFor,
  fmtDist,
  fmtNumber,
  signedRelErrorPct,
  MIN_GUESS_POINTS,
  SPEED_BONUS_MAX,
  DECAY_MIN_KM,
  DECAY_MAX_KM,
  DECAY_FALLBACK_KM,
  computeTripDecay,
  speedBonusFor,
  scoreForNumber,
  NUMBER_DECAY_K,
  DEFAULT_NUMBER_TOLERANCE,
  speedFactor,
  DEFAULT_TIME_SCORING,
} from './geo'

// Fórmula CRUDA sin el suelo (issue #956), para comparar contra `scoreFor`.
const rawScore = (km: number, decay: number) => Math.round(5000 * Math.exp(-km / decay))

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

  test('scoreFor: decrece con la distancia, pero nunca baja del SUELO (issue #956)', () => {
    expect(scoreFor(2000)).toBeLessThan(scoreFor(0))
    // Antes del suelo esto daba 0 seco (fallo de país = 0, feedback real del
    // viaje Filipinas); ahora un voto CON adivinanza nunca baja de 250.
    expect(scoreFor(100000)).toBe(MIN_GUESS_POINTS)
  })

  // ── Suelo mínimo por voto enviado (issue #956) ────────────────────────────
  test('MIN_GUESS_POINTS es 250 (constante nombrada, fácil de tocar)', () => {
    expect(MIN_GUESS_POINTS).toBe(250)
  })

  test('scoreFor: nunca por debajo del suelo, con cualquier decay, por lejos que falle', () => {
    for (const decay of [25, 300, 2000]) {
      expect(scoreFor(100000, decay)).toBe(MIN_GUESS_POINTS)
    }
  })

  test('scoreFor: por encima del suelo, el cálculo crudo no cambia (el suelo no "infla" nada)', () => {
    expect(scoreFor(0, 300)).toBe(rawScore(0, 300))
    expect(scoreFor(10, 300)).toBe(rawScore(10, 300))
  })

  // ── Scoring auto-calibrado (issue #994) — casos numéricos del experto ─────
  // Validados contra GeoGuessr real y simulaciones con datos del grupo Filipinas.
  test('casos del experto: distancia → puntos con cada decay', () => {
    expect(scoreFor(19, 300)).toBe(4693) // país-escala, guess casi perfecto
    expect(scoreFor(556, 300)).toBe(784)
    expect(scoreFor(8931, 300)).toBe(250) // suelo: fallo de continente
    expect(scoreFor(20, 25)).toBe(2247) // decay mínimo (viaje urbano)
    expect(scoreFor(753, 2000)).toBe(3431) // decay máximo (viaje mundial)
    expect(scoreFor(100, 300)).toBe(3583) // respaldo país (primer reto)
  })

  test('computeTripDecay: <2 puntos → respaldo país (300)', () => {
    expect(computeTripDecay([])).toBe(DECAY_FALLBACK_KM)
    expect(computeTripDecay([{ lat: 40, lng: -3 }])).toBe(DECAY_FALLBACK_KM)
  })

  test('computeTripDecay: clamps — nunca por debajo de 25 ni por encima de 2000', () => {
    // Dos puntos casi pegados → diagonal ~0 → clamp al mínimo.
    expect(
      computeTripDecay([
        { lat: 40, lng: -3 },
        { lat: 40.001, lng: -3.001 },
      ]),
    ).toBe(DECAY_MIN_KM)
    // Puntos en las antípodas → diagonal enorme → clamp al máximo.
    expect(
      computeTripDecay([
        { lat: 40, lng: -3 },
        { lat: -40, lng: 177 },
      ]),
    ).toBe(DECAY_MAX_KM)
  })

  test('computeTripDecay: robusto a un OUTLIER (caso 9 del experto)', () => {
    // 9 puntos en un radio de ~15 km + 1 outlier a ~800 km: el percentil-85
    // debe ignorarlo (diagonal efectiva ≈173 km, NO ~807 como daría un bbox).
    const cluster = Array.from({ length: 9 }, (_, i) => ({
      lat: 40 + (i % 3) * 0.09,
      lng: -3 + Math.floor(i / 3) * 0.09,
    }))
    const outlier = { lat: 47.2, lng: -1.55 } // ~800 km del cluster
    const decay = computeTripDecay([...cluster, outlier])
    // diagonal ≈173 km → decay ≈ 173/6 ≈ 29 km (lejos del ~134 que daría el bbox).
    expect(decay).toBeGreaterThan(DECAY_MIN_KM)
    expect(decay).toBeLessThan(40)
  })

  test('computeTripDecay: cruza el antimeridiano sin romperse (Filipinas↔Pacífico)', () => {
    const decay = computeTripDecay([
      { lat: 10, lng: 179 },
      { lat: 10, lng: -179 },
      { lat: 11, lng: 179.5 },
    ])
    // Puntos a ~200-300 km reales entre sí: el decay debe salir local (~<80),
    // no el máximo (que saldría si el centroide de longitudes se calculara mal).
    expect(decay).toBeLessThan(80)
  })

  test('fmtDist: metros, decimales y enteros', () => {
    expect(fmtDist(0.5)).toBe('500 m')
    expect(fmtDist(12.34)).toBe('12.3 km')
    expect(fmtDist(1500)).toBe('1500 km')
  })
})

// ── Bonus ADITIVO de rapidez (issue #994): desempata, nunca voltea ───────────
describe('speedBonusFor', () => {
  test('instantáneo = bonus máximo (+250)', () => {
    expect(speedBonusFor(0, 60)).toBe(SPEED_BONUS_MAX)
  })

  test('caso 7 del experto: 50% de tiempo restante → +125 (4000 base → 4125 total)', () => {
    expect(speedBonusFor(30, 60)).toBe(125)
    expect(4000 + speedBonusFor(30, 60)).toBe(4125)
  })

  test('caso 8 del experto: suelo 250 + 100% restante → 500 total', () => {
    expect(250 + speedBonusFor(0, 60)).toBe(500)
  })

  test('al límite (o pasado) = 0; límite inválido = 0', () => {
    expect(speedBonusFor(60, 60)).toBe(0)
    expect(speedBonusFor(90, 60)).toBe(0)
    expect(speedBonusFor(10, 0)).toBe(0)
  })
})

// ── Factor de velocidad (issue #628): premia rápido, penaliza tarde ──────────
describe('speedFactor', () => {
  test('por defecto está activada (DEFAULT_TIME_SCORING = true)', () => {
    expect(DEFAULT_TIME_SCORING).toBe(true)
  })

  test('respuesta instantánea (elapsed=0) da el factor máximo: 1', () => {
    expect(speedFactor(0, 30, true)).toBe(1)
  })

  test('al límite exacto (elapsed=límite) da el factor mínimo: 0.5', () => {
    expect(speedFactor(30, 30, true)).toBe(0.5)
  })

  test('a mitad de camino (elapsed=límite/2) da 0.75', () => {
    expect(speedFactor(15, 30, true)).toBe(0.75)
  })

  test('ejemplo del issue: 6s de 30s da 0,9', () => {
    expect(speedFactor(6, 30, true)).toBeCloseTo(0.9)
  })

  test('ACOTADO: un elapsed mayor que el límite no baja de 0.5', () => {
    expect(speedFactor(90, 30, true)).toBe(0.5)
  })

  test('ACOTADO: un elapsed negativo (reloj raro) no sube de 1', () => {
    expect(speedFactor(-5, 30, true)).toBe(1)
  })

  test('sin límite por jugada (guessSeconds null, "Libre"): factor 1, no aplica', () => {
    expect(speedFactor(5, null, true)).toBe(1)
  })

  test('time_scoring apagado: factor 1 aunque haya límite y elapsed', () => {
    expect(speedFactor(5, 30, false)).toBe(1)
  })

  test('sin elapsed conocido (legacy o start_play no registrado): factor 1', () => {
    expect(speedFactor(null, 30, true)).toBe(1)
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

  test('fmtNumber: es-ES con decimales fijos y unidad', () => {
    expect(fmtNumber(84.5, 2, '€')).toBe('84,50 €')
    // Coma decimal y separador de millares es-ES (punto) a partir de 5 cifras.
    expect(fmtNumber(12345, 0, 'km')).toBe('12.345 km')
    expect(fmtNumber(72, 0)).toBe('72')
    expect(fmtNumber(72, 0, null)).toBe('72')
  })

  test('signedRelErrorPct: signo + valor frente a la respuesta', () => {
    // 120 sobre 100 → +20 %
    expect(signedRelErrorPct(120, 100)).toBe('+20 %')
    // 82 sobre 100 → −18 %
    expect(signedRelErrorPct(82, 100)).toBe('−18 %')
    // clavarlo → 0 % sin signo
    expect(signedRelErrorPct(100, 100)).toBe('0 %')
  })
})
