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
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      signInAnonymously: () => signInAnonymouslyMock(),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
    },
  },
}))

import {
  setNextDestination,
  getNextDestination,
  takeNextDestination,
  signInAnonymously,
  linkAnonymousEmail,
  verifyLinkEmailOtp,
} from './auth'

beforeEach(() => {
  localStorage.clear()
  signInAnonymouslyMock.mockClear()
  updateUserMock.mockClear()
  verifyOtpMock.mockClear()
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
