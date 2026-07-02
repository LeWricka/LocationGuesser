import { describe, test, expect, vi } from 'vitest'

// Mock del cliente Supabase: solo necesitamos el cliente de auth para los tests
// de isVerifiedUser (función pura sobre el objeto User).
vi.mock('./supabase', () => ({
  supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: {} } })) } },
}))

import { isVerifiedUser } from './auth'
import type { User } from '@supabase/supabase-js'

const base = { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated' }

describe('isVerifiedUser (gate de crear en la UI, modelo email-first #506)', () => {
  test('null → no verificado', () => {
    expect(isVerifiedUser(null)).toBe(false)
  })

  test('anónimo con email pendiente (is_anonymous true) → NO verificado', () => {
    const user = { ...base, is_anonymous: true, email_confirmed_at: undefined } as unknown as User
    expect(isVerifiedUser(user)).toBe(false)
  })

  test('usuario OTP verificado (is_anonymous false + email_confirmed_at) → verificado', () => {
    const user = {
      ...base,
      is_anonymous: false,
      email: 'lewis@ej.com',
      email_confirmed_at: '2026-06-28T00:00:00Z',
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(true)
  })

  test('is_anonymous false pero SIN email confirmado → NO verificado', () => {
    // Escenario defensivo: si el flag is_anonymous cambia pero email_confirmed_at
    // sigue sin estar, NO abrimos el gate. Exigimos ambas condiciones.
    const user = {
      ...base,
      is_anonymous: false,
      email: 'lewis@ej.com',
      email_confirmed_at: null,
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(false)
  })

  test('usuario legacy sin is_anonymous pero con email confirmado → verificado', () => {
    // Usuarios registrados antes del modelo anónimo no llevan is_anonymous.
    const user = {
      ...base,
      email: 'lewis@ej.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(true)
  })
})
