import { describe, test, expect } from 'vitest'
import { remainingSeconds } from './resumeState'

describe('remainingSeconds', () => {
  const start = 1_000_000 // instante en que se pulsó Empezar (ms)

  test('al empezar (0s transcurridos) quedan todos los segundos', () => {
    expect(remainingSeconds(60, start, start)).toBe(60)
  })

  test('reanudar a media jugada: el reloj NO se reinicia, descuenta lo transcurrido', () => {
    // 20s después de empezar (p. ej. salió y volvió): quedan 40.
    expect(remainingSeconds(60, start, start + 20_000)).toBe(40)
  })

  test('si el tiempo ya pasó estando fuera, devuelve 0 (no negativo)', () => {
    expect(remainingSeconds(60, start, start + 90_000)).toBe(0)
  })

  test('redondea hacia abajo los segundos transcurridos', () => {
    // 10.9s transcurridos -> 10 contados -> quedan 50.
    expect(remainingSeconds(60, start, start + 10_900)).toBe(50)
  })
})
