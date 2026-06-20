import { describe, test, expect } from 'vitest'
import { formatCountdown } from './countdown'

const NOW = new Date('2026-06-20T12:00:00.000Z')
const plus = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatCountdown', () => {
  test('horas y minutos', () => {
    expect(formatCountdown(plus(3 * HOUR + 12 * MIN), NOW)).toBe('3 h 12 m')
  })

  test('solo minutos', () => {
    expect(formatCountdown(plus(8 * MIN), NOW)).toBe('8 m')
  })

  test('días con horas', () => {
    expect(formatCountdown(plus(2 * DAY + 5 * HOUR), NOW)).toBe('2 d 5 h')
  })

  test('días sin horas', () => {
    expect(formatCountdown(plus(2 * DAY), NOW)).toBe('2 d')
  })

  test('por debajo de un minuto → "ahora"', () => {
    expect(formatCountdown(plus(30 * 1000), NOW)).toBe('ahora')
  })

  test('plazo agotado → "cerrando"', () => {
    expect(formatCountdown(plus(-MIN), NOW)).toBe('cerrando')
  })
})
