import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock de supabase.auth. vi.hoisted porque vi.mock se eleva por encima de las
// declaraciones; así el objeto existe cuando la factory del mock lo captura.
// window.location.origin se usa como redirect, así que lo fijamos.
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { auth } }))

import {
  signInWithMagicLink,
  signInWithGoogle,
  signOut,
  getSession,
  getUser,
  onAuthStateChange,
} from './auth'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
})

describe('signInWithMagicLink', () => {
  test('llama a signInWithOtp con email y emailRedirectTo al origin', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null })
    await signInWithMagicLink('a@b.com')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { emailRedirectTo: 'https://app.test' },
    })
  })

  test('propaga el error de Supabase', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error('rate limit') })
    await expect(signInWithMagicLink('a@b.com')).rejects.toThrow('rate limit')
  })
})

describe('signInWithGoogle', () => {
  test('llama a signInWithOAuth con provider google y redirectTo al origin', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null })
    await signInWithGoogle()
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.test' },
    })
  })
})

describe('signOut', () => {
  test('propaga el error de Supabase', async () => {
    auth.signOut.mockResolvedValue({ error: new Error('boom') })
    await expect(signOut()).rejects.toThrow('boom')
  })
})

describe('getSession / getUser', () => {
  test('getSession devuelve la sesión', async () => {
    const session = { access_token: 'tok' }
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    expect(await getSession()).toBe(session)
  })

  test('getUser devuelve el usuario', async () => {
    const user = { id: 'u1' }
    auth.getUser.mockResolvedValue({ data: { user }, error: null })
    expect(await getUser()).toBe(user)
  })

  test('getUser propaga el error', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no jwt') })
    await expect(getUser()).rejects.toThrow('no jwt')
  })
})

describe('onAuthStateChange', () => {
  test('devuelve la subscription para poder desuscribirse', () => {
    const subscription = { unsubscribe: vi.fn() }
    auth.onAuthStateChange.mockReturnValue({ data: { subscription } })
    const cb = vi.fn()
    expect(onAuthStateChange(cb)).toBe(subscription)
    expect(auth.onAuthStateChange).toHaveBeenCalledWith(cb)
  })
})
