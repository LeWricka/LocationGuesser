import { describe, test, expect } from 'vitest'
import { needsProfileStep } from './profileStep'
import type { Profile } from '../../lib/database.types'

function profile(displayName: string): Profile {
  return {
    id: 'u1',
    display_name: displayName,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
    onboarding: {},
  }
}

describe('needsProfileStep', () => {
  test('sin perfil → pide paso', () => {
    expect(needsProfileStep(null)).toBe(true)
  })

  test('display_name vacío → pide paso', () => {
    expect(needsProfileStep(profile('   '))).toBe(true)
  })

  test('cualquier nombre elegido → no pide (aunque coincida con el email)', () => {
    // Regresión: "iker" en iker@… quedaba atrapado en bucle con la heurística vieja.
    expect(needsProfileStep(profile('iker'))).toBe(false)
    expect(needsProfileStep(profile('Lewis Real'))).toBe(false)
  })
})
