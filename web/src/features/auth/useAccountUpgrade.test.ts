import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// lib/auth.ts importa ./supabase (lanza sin env vars); mockeamos los dos
// helpers que este hook usa para vincular anónimo → permanente (issue #758).
const linkAnonymousEmail = vi.fn<(email: string) => Promise<void>>(async () => {})
const verifyLinkEmailOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
vi.mock('../../lib/auth', () => ({
  linkAnonymousEmail: (email: string) => linkAnonymousEmail(email),
  verifyLinkEmailOtp: (email: string, token: string) => verifyLinkEmailOtp(email, token),
}))

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

import { useAccountUpgrade } from './useAccountUpgrade'

beforeEach(() => {
  linkAnonymousEmail.mockClear()
  linkAnonymousEmail.mockResolvedValue(undefined)
  verifyLinkEmailOtp.mockClear()
  verifyLinkEmailOtp.mockResolvedValue(undefined)
})

describe('useAccountUpgrade (issue #758, vincular anónimo → permanente)', () => {
  test('email inválido: no llama a linkAnonymousEmail y fija un error', async () => {
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('noesemail'))
    await act(async () => {
      await result.current.submit()
    })
    expect(linkAnonymousEmail).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/correo válido/i)
    expect(result.current.step).toBe('email')
  })

  test('email válido: llama a linkAnonymousEmail (NO a sendEmailOtp) y pasa a "code"', async () => {
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    expect(linkAnonymousEmail).toHaveBeenCalledWith('lewis@ej.com')
    expect(result.current.step).toBe('code')
  })

  test('código inválido (no 6 dígitos): no llama a verifyLinkEmailOtp, devuelve false', async () => {
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    act(() => result.current.setCode('123'))
    let ok: boolean = true
    await act(async () => {
      ok = await result.current.verify()
    })
    expect(ok).toBe(false)
    expect(verifyLinkEmailOtp).not.toHaveBeenCalled()
  })

  test('código correcto: canjea con verifyLinkEmailOtp y devuelve true (mismo uid, sesión pasa a permanente)', async () => {
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    act(() => result.current.setCode('123456'))
    let ok = false
    await act(async () => {
      ok = await result.current.verify()
    })
    expect(ok).toBe(true)
    expect(verifyLinkEmailOtp).toHaveBeenCalledWith('lewis@ej.com', '123456')
  })

  test('código incorrecto/caducado: verify devuelve false y fija un error legible', async () => {
    verifyLinkEmailOtp.mockRejectedValueOnce(new Error('otp_expired'))
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    act(() => result.current.setCode('000000'))
    let ok = true
    await act(async () => {
      ok = await result.current.verify()
    })
    expect(ok).toBe(false)
    expect(result.current.error).toMatch(/incorrecto o caducado/i)
  })

  test('reset vuelve al paso de email y limpia el código/error', async () => {
    const { result } = renderHook(() => useAccountUpgrade())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    act(() => result.current.setCode('12'))
    act(() => result.current.reset())
    expect(result.current.step).toBe('email')
    expect(result.current.code).toBe('')
    expect(result.current.error).toBeNull()
  })
})
