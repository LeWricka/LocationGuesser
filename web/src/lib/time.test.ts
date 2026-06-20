import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDeadline, isPast } from './time'

describe('time', () => {
  beforeEach(() => {
    // Fijamos "ahora" para que hoy/mañana sean deterministas.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T10:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  test('mismo día → "hasta hoy"', () => {
    expect(formatDeadline('2026-06-20T23:59:00')).toMatch(/^hasta hoy a las/)
  })

  test('día siguiente → "hasta mañana"', () => {
    expect(formatDeadline('2026-06-21T14:00:00')).toMatch(/^hasta mañana a las/)
  })

  test('más adelante → fecha concreta', () => {
    expect(formatDeadline('2026-06-25T14:00:00')).toMatch(/^hasta el .* a las/)
  })

  test('isPast', () => {
    expect(isPast('2026-06-20T09:00:00')).toBe(true)
    expect(isPast('2026-06-20T11:00:00')).toBe(false)
  })
})
