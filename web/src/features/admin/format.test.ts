import { describe, expect, it } from 'vitest'
import {
  fmtCadence,
  fmtDate,
  fmtInt,
  fmtKind,
  fmtKm,
  fmtNumber,
  fmtPercent,
  fmtSeconds,
  fmtSince,
  fmtStatus,
} from './format'

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

  it('fmtSince elige la unidad mayor relativa a "ahora"', () => {
    const now = new Date('2026-06-20T12:00:00Z')
    expect(fmtSince('2026-06-17T12:00:00Z', now)).toBe('hace 3 días')
    expect(fmtSince('2026-06-20T09:00:00Z', now)).toBe('hace 3 horas')
    expect(fmtSince('2026-06-20T11:30:00Z', now)).toBe('hace 30 minutos')
    expect(fmtSince(null, now)).toBe('—')
    expect(fmtSince('no-es-fecha', now)).toBe('—')
  })

  it('fmtKind traduce el tipo de reto; desconocido/null → guion', () => {
    expect(fmtKind('foto_sv')).toBe('Foto + Street View')
    expect(fmtKind('foto')).toBe('Foto')
    expect(fmtKind('sv')).toBe('Street View')
    expect(fmtKind('ninguno')).toBe('Sin medios')
    expect(fmtKind(null)).toBe('—')
  })

  it('fmtStatus traduce el estado del reto; null → guion', () => {
    expect(fmtStatus('abierto')).toBe('Abierto')
    expect(fmtStatus('cerrado')).toBe('Cerrado')
    expect(fmtStatus('practica')).toBe('Práctica')
    expect(fmtStatus(null)).toBe('—')
  })
})
