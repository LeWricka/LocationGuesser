import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { deadlineFromMinutes, deadlineFromNow, formatDeadline, isPast } from './time'

describe('time', () => {
  beforeEach(() => {
    // Fijamos "ahora" para que la cuenta atrás sea determinista.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  describe('formatDeadline (cuenta atrás)', () => {
    test('horas y minutos', () => {
      // +3 h 12 m
      expect(formatDeadline('2026-06-20T13:12:00Z')).toBe('quedan 3 h 12 m')
    })

    test('horas exactas → sin minutos', () => {
      expect(formatDeadline('2026-06-20T14:00:00Z')).toBe('quedan 4 h')
    })

    test('solo minutos', () => {
      expect(formatDeadline('2026-06-20T10:45:00Z')).toBe('quedan 45 m')
    })

    test('menos de un minuto → segundos', () => {
      expect(formatDeadline('2026-06-20T10:00:30Z')).toBe('quedan 30 s')
    })

    test('más de un día → días y horas', () => {
      // +1 d 5 h
      expect(formatDeadline('2026-06-21T15:00:00Z')).toBe('quedan 1 d 5 h')
    })

    test('plazo vencido → cerrado', () => {
      expect(formatDeadline('2026-06-20T09:00:00Z')).toBe('cerrado')
    })
  })

  describe('deadlineFromNow', () => {
    test('suma horas y devuelve ISO absoluto', () => {
      expect(deadlineFromNow(4)).toBe('2026-06-20T14:00:00.000Z')
    })

    test('admite fracciones de hora', () => {
      expect(deadlineFromNow(0.5)).toBe('2026-06-20T10:30:00.000Z')
    })
  })

  describe('deadlineFromMinutes', () => {
    test('suma minutos y devuelve ISO absoluto', () => {
      expect(deadlineFromMinutes(30)).toBe('2026-06-20T10:30:00.000Z')
    })

    test('admite plazos express muy cortos', () => {
      expect(deadlineFromMinutes(5)).toBe('2026-06-20T10:05:00.000Z')
    })

    test('coincide con deadlineFromNow (horas = minutos/60)', () => {
      expect(deadlineFromMinutes(240)).toBe(deadlineFromNow(4))
    })
  })

  test('isPast', () => {
    expect(isPast('2026-06-20T09:00:00Z')).toBe(true)
    expect(isPast('2026-06-20T11:00:00Z')).toBe(false)
  })
})
