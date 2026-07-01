import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del cliente Supabase: espiamos las llamadas de auth y de profiles. Cada test
// configura el comportamiento (sesión previa, error de email duplicado, etc.). Se
// define con vi.hoisted porque el factory de vi.mock se eleva al top del fichero.
const { auth, profilesUpsert, supabaseMock } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signInAnonymously: vi.fn(),
    updateUser: vi.fn(),
    signInWithOtp: vi.fn(),
  }
  const profilesUpsert = vi.fn()
  const supabaseMock = { auth, from: vi.fn(() => ({ upsert: profilesUpsert })) }
  return { auth, profilesUpsert, supabaseMock }
})
vi.mock('./supabase', () => ({ supabase: supabaseMock }))

import { enterWithNameAndEmail, resendEmailValidation, isVerifiedUser } from './auth'
import type { User } from '@supabase/supabase-js'

function ok<T>(data: T) {
  return Promise.resolve({ data, error: null })
}
function fail(error: unknown) {
  return Promise.resolve({ data: {}, error })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Por defecto: sin sesión previa; alta anónima OK; getUser devuelve un id;
  // updateUser y el upsert de perfil OK.
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.signInAnonymously.mockResolvedValue(ok({}))
  auth.getUser.mockResolvedValue({ data: { user: { id: 'anon-1' } }, error: null })
  auth.updateUser.mockResolvedValue(ok({}))
  auth.signInWithOtp.mockResolvedValue(ok({}))
  profilesUpsert.mockResolvedValue({ error: null })
})

describe('enterWithNameAndEmail', () => {
  test('crea anónimo, pone el nombre (metadata + perfil) y enlaza el email', async () => {
    const result = await enterWithNameAndEmail('Lewis', 'lewis@ej.com', 'https://app.test')

    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
    // Nombre al metadata.
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Lewis' } })
    // Nombre a profiles (para saltar ProfileGate).
    expect(supabaseMock.from).toHaveBeenCalledWith('profiles')
    expect(profilesUpsert).toHaveBeenCalledWith(
      { id: 'anon-1', display_name: 'Lewis' },
      { onConflict: 'id' },
    )
    // Enlace del email con redirect.
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'lewis@ej.com' },
      { emailRedirectTo: 'https://app.test' },
    )
    expect(result).toEqual({ kind: 'entered' })
  })

  test('NO crea un anónimo nuevo si ya hay sesión (reintento): reutiliza el user', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'anon-1' } } },
      error: null,
    })
    await enterWithNameAndEmail('Lewis', 'lewis@ej.com')
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
    // Aun así enlaza el email (paso idempotente).
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'lewis@ej.com' },
      expect.objectContaining({ emailRedirectTo: expect.any(String) }),
    )
  })

  test('email YA registrado (email_exists) → magic link de recuperación, no rompe', async () => {
    // El updateUser del nombre va OK; el del email falla con email_exists.
    auth.updateUser
      .mockResolvedValueOnce(ok({})) // display_name
      .mockResolvedValueOnce(
        fail({ code: 'email_exists', message: 'Email address already exists' }),
      )

    const result = await enterWithNameAndEmail('Lewis', 'ya@existe.com', 'https://app.test')

    // Se manda un magic link de recuperación (signInWithOtp) al mismo correo.
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1)
    const otpArgs = auth.signInWithOtp.mock.calls[0][0]
    expect(otpArgs.email).toBe('ya@existe.com')
    expect(result).toEqual({ kind: 'email-exists' })
  })

  test('detecta email duplicado también por mensaje si falta el code', async () => {
    auth.updateUser
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(
        fail({ message: 'A user with this email address has already been registered' }),
      )
    const result = await enterWithNameAndEmail('Lewis', 'ya@existe.com')
    expect(result).toEqual({ kind: 'email-exists' })
    expect(auth.signInWithOtp).toHaveBeenCalled()
  })

  test('otro error del enlace de email se propaga (no lo tragamos)', async () => {
    auth.updateUser
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(fail({ code: 'over_email_send_rate_limit', message: 'rate limit' }))
    await expect(enterWithNameAndEmail('Lewis', 'lewis@ej.com')).rejects.toBeTruthy()
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  test('si el alta anónima falla, se propaga (no seguimos a ciegas)', async () => {
    auth.signInAnonymously.mockResolvedValue(fail({ message: 'anon disabled' }))
    await expect(enterWithNameAndEmail('Lewis', 'lewis@ej.com')).rejects.toBeTruthy()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('resendEmailValidation', () => {
  test('reenvía el enlace al email pendiente del usuario actual', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'anon-1', email: 'lewis@ej.com' } } })
    await resendEmailValidation('https://app.test')
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'lewis@ej.com' },
      { emailRedirectTo: 'https://app.test' },
    )
  })

  test('sin email pendiente lanza (no manda nada)', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'anon-1', email: undefined } } })
    await expect(resendEmailValidation()).rejects.toBeTruthy()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('isVerifiedUser (gate de crear en la UI)', () => {
  const base = { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated' }

  test('null → no verificado', () => {
    expect(isVerifiedUser(null)).toBe(false)
  })

  test('anónimo con email pendiente (is_anonymous true) → NO verificado', () => {
    const user = { ...base, is_anonymous: true, email_confirmed_at: undefined } as unknown as User
    expect(isVerifiedUser(user)).toBe(false)
  })

  test('permanente con email confirmado → verificado', () => {
    const user = {
      ...base,
      is_anonymous: false,
      email: 'lewis@ej.com',
      email_confirmed_at: '2026-06-28T00:00:00Z',
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(true)
  })

  test('BUG supabase#29350: is_anonymous flip a false pero SIN confirmar → NO verificado', () => {
    // Si el cliente marca is_anonymous=false pero email_confirmed_at sigue vacío,
    // NO abrimos el gate: exigimos ambas condiciones.
    const user = {
      ...base,
      is_anonymous: false,
      email: 'lewis@ej.com',
      email_confirmed_at: null,
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(false)
  })

  test('usuario legacy sin is_anonymous pero con email confirmado → verificado', () => {
    // Los usuarios YA registrados (antes de este hito) no llevan is_anonymous.
    const user = {
      ...base,
      email: 'lewis@ej.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    } as unknown as User
    expect(isVerifiedUser(user)).toBe(true)
  })
})
