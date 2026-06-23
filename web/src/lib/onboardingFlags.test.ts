import { beforeEach, describe, expect, test } from 'vitest'
import { hasSeenOnboarding, markOnboardingSeen } from './onboardingFlags'

describe('onboardingFlags', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('por defecto no se ha visto', () => {
    expect(hasSeenOnboarding('group', 'u1')).toBe(false)
    expect(hasSeenOnboarding('challenge', 'u1')).toBe(false)
  })

  test('marcar como visto lo persiste para ese contexto y usuario', () => {
    markOnboardingSeen('group', 'u1')
    expect(hasSeenOnboarding('group', 'u1')).toBe(true)
    // No contamina el otro contexto.
    expect(hasSeenOnboarding('challenge', 'u1')).toBe(false)
  })

  test('el estado es por usuario (dos cuentas no se pisan)', () => {
    markOnboardingSeen('group', 'u1')
    expect(hasSeenOnboarding('group', 'u2')).toBe(false)
  })

  test('sin userId usa una clave global anónima', () => {
    markOnboardingSeen('group')
    expect(hasSeenOnboarding('group')).toBe(true)
    expect(hasSeenOnboarding('group', null)).toBe(true)
    // Un usuario con id no hereda el flag anónimo.
    expect(hasSeenOnboarding('group', 'u1')).toBe(false)
  })
})
