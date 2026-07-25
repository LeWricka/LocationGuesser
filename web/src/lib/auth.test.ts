import { describe, test, expect, vi, beforeEach } from 'vitest'

// auth.ts importa ./supabase, que lanza sin env vars. Mockeamos solo lo que
// usan los helpers de destino/sesión anónima (no tocan supabase, pero el
// import debe resolver).
const signInAnonymouslyMock = vi.fn(async () => ({ data: {}, error: null as Error | null }))
const updateUserMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: Error | null }>
>(async () => ({ data: {}, error: null }))
const verifyOtpMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: Error | null }>
>(async () => ({ data: {}, error: null }))
const signInWithOtpMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: Error | null }>
>(async () => ({ data: {}, error: null }))
const rpcMock = vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: Error | null }>>(
  async () => ({ data: null, error: null }),
)
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      signInAnonymously: () => signInAnonymouslyMock(),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

import {
  setNextDestination,
  getNextDestination,
  takeNextDestination,
  signInAnonymously,
  linkAnonymousEmail,
  verifyLinkEmailOtp,
  isEmailAlreadyRegisteredError,
  requestAccountMerge,
  completeAccountMerge,
  sendExistingAccountLoginOtp,
} from './auth'

beforeEach(() => {
  localStorage.clear()
  signInAnonymouslyMock.mockClear()
  updateUserMock.mockClear()
  verifyOtpMock.mockClear()
  signInWithOtpMock.mockClear()
  signInWithOtpMock.mockResolvedValue({ data: {}, error: null })
  rpcMock.mockClear()
  rpcMock.mockResolvedValue({ data: null, error: null })
})

describe('destino deep-link (lg.next)', () => {
  test('guarda y lee el destino', () => {
    setNextDestination('#g=ABC&c=uuid')
    expect(getNextDestination()).toBe('#g=ABC&c=uuid')
  })

  test('no guarda destino vacío', () => {
    setNextDestination('')
    expect(getNextDestination()).toBeNull()
  })

  test('take devuelve y borra (uso único)', () => {
    setNextDestination('#g=ABC')
    expect(takeNextDestination()).toBe('#g=ABC')
    expect(getNextDestination()).toBeNull()
    expect(takeNextDestination()).toBeNull()
  })
})

// Sesión anónima del receptor (issue #758): reemplaza al viejo gate de sesión
// legada (#514, retirado) — ahora un anónimo es una sesión válida de primera
// clase, y `signInAnonymously` es el único wrapper que la crea.
describe('signInAnonymously', () => {
  test('éxito → sin error', async () => {
    expect(await signInAnonymously()).toEqual({ error: null })
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1)
  })

  test('DEGRADA CON ELEGANCIA si Supabase devuelve error (p.ej. toggle apagado): no lanza', async () => {
    const err = new Error('Anonymous sign-ins are disabled')
    signInAnonymouslyMock.mockResolvedValueOnce({ data: {}, error: err })
    await expect(signInAnonymously()).resolves.toEqual({ error: err })
  })

  test('DEGRADA si supabase.auth.signInAnonymously lanza en vez de devolver error: no propaga', async () => {
    signInAnonymouslyMock.mockRejectedValueOnce(new Error('network'))
    const { error } = await signInAnonymously()
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('network')
  })
})

describe('linkAnonymousEmail / verifyLinkEmailOtp (vincular anónimo → permanente, issue #758)', () => {
  test('linkAnonymousEmail llama a updateUser({ email })', async () => {
    await linkAnonymousEmail('lewis@ej.com')
    expect(updateUserMock).toHaveBeenCalledWith({ email: 'lewis@ej.com' })
  })

  test('linkAnonymousEmail lanza si Supabase devuelve error', async () => {
    updateUserMock.mockResolvedValueOnce({ data: {}, error: new Error('ya registrado') })
    await expect(linkAnonymousEmail('lewis@ej.com')).rejects.toThrow('ya registrado')
  })

  test('verifyLinkEmailOtp canjea con type "email_change" (no "email"): distingue vincular de alta/login', async () => {
    await verifyLinkEmailOtp('lewis@ej.com', '123456')
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'lewis@ej.com',
      token: '123456',
      type: 'email_change',
    })
  })

  test('verifyLinkEmailOtp lanza si el código es incorrecto/caducado', async () => {
    verifyOtpMock.mockResolvedValueOnce({ data: {}, error: new Error('código inválido') })
    await expect(verifyLinkEmailOtp('lewis@ej.com', '000000')).rejects.toThrow('código inválido')
  })
})

// Fusión cuando el email ya pertenece a otra cuenta (issue #944).
describe('fusión de cuentas (issue #944)', () => {
  describe('isEmailAlreadyRegisteredError: detecta por código/estado, no por texto', () => {
    test('code email_exists → true', () => {
      expect(isEmailAlreadyRegisteredError({ code: 'email_exists', status: 422 })).toBe(true)
    })
    test('status 422 con mensaje "already been registered" → true (red por si no hay code)', () => {
      expect(
        isEmailAlreadyRegisteredError({
          status: 422,
          message: 'A user with this email address has already been registered',
        }),
      ).toBe(true)
    })
    test('otro error (p.ej. rate limit 429) → false', () => {
      expect(
        isEmailAlreadyRegisteredError({ code: 'over_email_send_rate_limit', status: 429 }),
      ).toBe(false)
    })
    test('no-objeto → false', () => {
      expect(isEmailAlreadyRegisteredError('boom')).toBe(false)
      expect(isEmailAlreadyRegisteredError(null)).toBe(false)
    })
  })

  test('requestAccountMerge devuelve el token de la RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'token-uuid', error: null })
    await expect(requestAccountMerge()).resolves.toBe('token-uuid')
    expect(rpcMock).toHaveBeenCalledWith('request_account_merge')
  })

  test('requestAccountMerge lanza si la RPC devuelve error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('no anónimo') })
    await expect(requestAccountMerge()).rejects.toThrow('no anónimo')
  })

  test('completeAccountMerge pasa source y token a la RPC', async () => {
    await completeAccountMerge('src-uid', 'token-uuid')
    expect(rpcMock).toHaveBeenCalledWith('complete_account_merge', {
      p_source_uid: 'src-uid',
      p_token: 'token-uuid',
    })
  })

  test('completeAccountMerge lanza si la RPC devuelve error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('token caducado') })
    await expect(completeAccountMerge('src-uid', 'token-uuid')).rejects.toThrow('token caducado')
  })

  test('sendExistingAccountLoginOtp usa shouldCreateUser:false (login, no alta)', async () => {
    await sendExistingAccountLoginOtp('lewis@ej.com')
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'lewis@ej.com',
      options: { shouldCreateUser: false },
    })
  })
})
