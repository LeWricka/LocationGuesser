import { describe, test, expect } from 'vitest'
import { needsProfileStep } from './profileStep'
import type { Profile } from '../../lib/database.types'

function profile(displayName: string): Profile {
  return {
    id: 'u1',
    display_name: displayName,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('needsProfileStep', () => {
  test('sin perfil → pide paso', () => {
    expect(needsProfileStep(null, 'lewis@ej.com')).toBe(true)
  })

  test('display_name vacío → pide paso', () => {
    expect(needsProfileStep(profile('   '), 'lewis@ej.com')).toBe(true)
  })

  test('display_name = provisional del email → pide paso', () => {
    expect(needsProfileStep(profile('lewis'), 'lewis@ej.com')).toBe(true)
  })

  test('display_name elegido (distinto del provisional) → no pide', () => {
    expect(needsProfileStep(profile('Lewis Real'), 'lewis@ej.com')).toBe(false)
  })

  test('sin email: nombre no vacío basta', () => {
    expect(needsProfileStep(profile('Lewis'), undefined)).toBe(false)
  })
})
