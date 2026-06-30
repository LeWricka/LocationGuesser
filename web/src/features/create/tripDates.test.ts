import { describe, test, expect } from 'vitest'
import { formatTripDates } from './tripDates'

describe('formatTripDates', () => {
  test('sin fechas → null', () => {
    expect(formatTripDates('', '')).toBeNull()
    expect(formatTripDates(null, undefined)).toBeNull()
  })

  test('rango en el mismo año → "12 – 26 oct 2026 · 15 días"', () => {
    expect(formatTripDates('2026-10-12', '2026-10-26')).toBe('12 oct – 26 oct 2026 · 15 días')
  })

  test('mismo día → 1 día (singular)', () => {
    expect(formatTripDates('2026-10-12', '2026-10-12')).toBe('12 oct – 12 oct 2026 · 1 día')
  })

  test('rango a caballo entre dos años muestra ambos años', () => {
    expect(formatTripDates('2026-12-30', '2027-01-02')).toBe('30 dic 2026 – 2 ene 2027 · 4 días')
  })

  test('solo salida → "Desde el …"', () => {
    expect(formatTripDates('2026-10-12', '')).toBe('Desde el 12 oct 2026')
  })

  test('solo vuelta → "Hasta el …"', () => {
    expect(formatTripDates(null, '2026-10-26')).toBe('Hasta el 26 oct 2026')
  })

  test('rango invertido se endereza', () => {
    expect(formatTripDates('2026-10-26', '2026-10-12')).toBe('12 oct – 26 oct 2026 · 15 días')
  })

  test('fecha mal formada se ignora', () => {
    expect(formatTripDates('no-es-fecha', '2026-10-26')).toBe('Hasta el 26 oct 2026')
  })
})
