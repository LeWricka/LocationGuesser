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

// Arreglo de raíz del onboarding repetido (issue #717): el perfil (servidor) es
// la fuente de la verdad cuando hay sesión; localStorage es solo caché.
describe('onboardingFlags — perfil como fuente de la verdad (#717)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('perfil visto + storage vacío → NO se muestra (hasSeenOnboarding true)', () => {
    expect(hasSeenOnboarding('group', 'u1', { group: '2026-07-01T00:00:00.000Z' })).toBe(true)
  })

  test('perfil limpio ({}) + storage vacío → se muestra (hasSeenOnboarding false)', () => {
    expect(hasSeenOnboarding('group', 'u1', {})).toBe(false)
  })

  test('perfil sin la clave de este contexto + storage vacío → se muestra', () => {
    expect(hasSeenOnboarding('group', 'u1', { challenge: '2026-07-01T00:00:00.000Z' })).toBe(false)
  })

  test('sin perfil (undefined/null) cae al comportamiento de localStorage de siempre', () => {
    expect(hasSeenOnboarding('group', 'u1', undefined)).toBe(false)
    expect(hasSeenOnboarding('group', 'u1', null)).toBe(false)
    markOnboardingSeen('group', 'u1')
    expect(hasSeenOnboarding('group', 'u1', null)).toBe(true)
  })

  test('un "visto" ya registrado antes de la migración (solo localStorage) sigue contando', () => {
    // Simula un usuario que vio el tutorial antes de #717: su perfil recién
    // migrado empieza en '{}', pero su localStorage YA lo tenía marcado.
    markOnboardingSeen('group', 'u1')
    expect(hasSeenOnboarding('group', 'u1', {})).toBe(true)
  })
})
