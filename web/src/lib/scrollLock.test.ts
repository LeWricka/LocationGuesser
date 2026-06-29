import { describe, test, expect, afterEach } from 'vitest'
import { lockBodyScroll } from './scrollLock'

afterEach(() => {
  // Deja el body limpio entre tests (por si un test no suelta todas sus cerraduras).
  document.body.style.overflow = ''
})

describe('lockBodyScroll', () => {
  test('bloquea al primer lock y restaura al soltar el último', () => {
    document.body.style.overflow = ''
    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    release()
    expect(document.body.style.overflow).toBe('')
  })

  test('con cerraduras solapadas, el body sigue bloqueado hasta soltar TODAS', () => {
    document.body.style.overflow = ''
    const a = lockBodyScroll()
    const b = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    a()
    // Aún queda una cerradura: no se restaura todavía (esto evita el bug de la
    // pantalla desconfigurada al volver del reto con la hoja abierta).
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('')
  })

  test('soltar dos veces es idempotente (no rompe el contador)', () => {
    document.body.style.overflow = ''
    const a = lockBodyScroll()
    const b = lockBodyScroll()
    a()
    a() // doble release de la misma cerradura: no debe descontar de más
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('')
  })

  test('restaura el valor ORIGINAL, no fuerza cadena vacía', () => {
    document.body.style.overflow = 'scroll'
    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
    release()
    expect(document.body.style.overflow).toBe('scroll')
  })
})
