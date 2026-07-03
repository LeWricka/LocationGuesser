import { describe, test, expect } from 'vitest'
import { describeChallengeClosure } from './challengeClosure'

describe('describeChallengeClosure', () => {
  test('sin plazo (recuerdo) → "Sin plazo"', () => {
    expect(describeChallengeClosure(null)).toBe('Sin plazo')
  })

  test('reto de práctica (plazo a años vista) → "Sin plazo"', () => {
    expect(describeChallengeClosure('2999-12-31T23:59:59.999Z')).toBe('Sin plazo')
  })

  test('plazo en el pasado → "Cerrado"', () => {
    expect(describeChallengeClosure('2020-01-01T00:00:00.000Z')).toBe('Cerrado')
  })

  test('plazo dentro de menos de una hora → minutos', () => {
    const in30min = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    expect(describeChallengeClosure(in30min)).toBe('Cierra en 30 min')
  })

  test('plazo dentro de varias horas (menos de 48h) → horas', () => {
    const in5h = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    expect(describeChallengeClosure(in5h)).toBe('Cierra en 5 h')
  })

  test('plazo a varios días vista (≥48h, no práctica) → días', () => {
    const in4days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    expect(describeChallengeClosure(in4days)).toBe('Cierra en 4 d')
  })
})
