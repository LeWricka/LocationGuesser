import { describe, test, expect } from 'vitest'
import { describeDeadlineEcho } from './deadlineEcho'

// Un miércoles a las 10:00 (fecha fija: la función es pura y no toca el reloj).
const MIERCOLES_10H = new Date(2026, 6, 15, 10, 0)
// El mismo miércoles a última hora, para forzar cierres que cruzan la medianoche.
const MIERCOLES_22H = new Date(2026, 6, 15, 22, 0)

describe('describeDeadlineEcho', () => {
  test('cierre dentro del mismo día → "hoy" con la hora', () => {
    expect(describeDeadlineEcho(60, MIERCOLES_10H)).toBe('Cierra hoy a las 11:00')
  })

  test('12 h creando por la noche cruzan la medianoche → "mañana" (el porqué del cambio)', () => {
    expect(describeDeadlineEcho(720, MIERCOLES_22H)).toBe('Cierra mañana a las 10:00')
  })

  test('12 h creando por la mañana → sigue siendo "hoy"', () => {
    expect(describeDeadlineEcho(720, MIERCOLES_10H)).toBe('Cierra hoy a las 22:00')
  })

  test('3 días → día de la semana + número', () => {
    expect(describeDeadlineEcho(4320, MIERCOLES_10H)).toBe('Cierra el sáb 18 a las 10:00')
  })

  test('los minutos se conservan con cero a la izquierda', () => {
    expect(describeDeadlineEcho(65, MIERCOLES_10H)).toBe('Cierra hoy a las 11:05')
  })
})
