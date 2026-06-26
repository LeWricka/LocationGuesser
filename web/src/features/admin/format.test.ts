import { describe, expect, it } from 'vitest'
import { fmtCadence, fmtDate, fmtInt, fmtKm, fmtNumber, fmtPercent, fmtSeconds } from './format'

describe('formateadores de admin', () => {
  it('fmtInt redondea y separa miles; null → guion', () => {
    // es-ES no agrupa con 4 dígitos (CLDR); sí a partir de 5 → "12.345".
    expect(fmtInt(12345)).toBe('12.345')
    expect(fmtInt(12.6)).toBe('13')
    expect(fmtInt(null)).toBe('—')
    expect(fmtInt(undefined)).toBe('—')
  })

  it('fmtNumber respeta decimales; null → guion', () => {
    expect(fmtNumber(3.456)).toBe('3,5')
    expect(fmtNumber(3.456, 0)).toBe('3')
    expect(fmtNumber(null)).toBe('—')
  })

  it('fmtPercent añade el sufijo; null → guion', () => {
    expect(fmtPercent(87.5)).toBe('87,5 %')
    expect(fmtPercent(null)).toBe('—')
  })

  it('fmtSeconds usa minutos a partir de 60 s', () => {
    expect(fmtSeconds(45)).toBe('45 s')
    expect(fmtSeconds(150)).toBe('2 min 30 s')
    expect(fmtSeconds(120)).toBe('2 min')
    expect(fmtSeconds(null)).toBe('—')
  })

  it('fmtCadence concuerda singular/plural', () => {
    expect(fmtCadence(1)).toBe('cada 1 día')
    expect(fmtCadence(3.2)).toBe('cada 3,2 días')
    expect(fmtCadence(null)).toBe('—')
  })

  it('fmtKm añade unidad; null → guion', () => {
    expect(fmtKm(12345)).toBe('12.345 km')
    expect(fmtKm(null)).toBe('—')
  })

  it('fmtDate da formato compacto; inválida → guion', () => {
    expect(fmtDate('2026-06-12T10:00:00Z')).toMatch(/2026/)
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate('no-es-fecha')).toBe('—')
  })
})
