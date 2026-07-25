import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// lib/auth.ts importa ./supabase (lanza sin env vars); mockeamos los helpers que
// este hook usa: vincular anónimo → permanente (issue #758) y la fusión de una
// cuenta cuando el email ya existe (issue #944).
const linkAnonymousEmail = vi.fn<(email: string) => Promise<void>>(async () => {})
const verifyLinkEmailOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
const verifyEmailOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
const getUser = vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: 'anon-uid' }))
const requestAccountMerge = vi.fn<() => Promise<string>>(async () => 'merge-token')
const completeAccountMerge = vi.fn<(sourceUid: string, token: string) => Promise<void>>(
  async () => {},
)
const sendExistingAccountLoginOtp = vi.fn<(email: string) => Promise<void>>(async () => {})
const isEmailAlreadyRegisteredError = vi.fn<(err: unknown) => boolean>(() => false)
vi.mock('../../lib/auth', () => ({
  linkAnonymousEmail: (email: string) => linkAnonymousEmail(email),
  verifyLinkEmailOtp: (email: string, token: string) => verifyLinkEmailOtp(email, token),
  verifyEmailOtp: (email: string, token: string) => verifyEmailOtp(email, token),
  getUser: () => getUser(),
  requestAccountMerge: () => requestAccountMerge(),
  completeAccountMerge: (sourceUid: string, token: string) =>
    completeAccountMerge(sourceUid, token),
  sendExistingAccountLoginOtp: (email: string) => sendExistingAccountLoginOtp(email),
  isEmailAlreadyRegisteredError: (err: unknown) => isEmailAlreadyRegisteredError(err),
}))

const track = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const reportError = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

import { useAccountUpgrade } from './useAccountUpgrade'

beforeEach(() => {
  linkAnonymousEmail.mockClear()
  linkAnonymousEmail.mockResolvedValue(undefined)
  verifyLinkEmailOtp.mockClear()
  verifyLinkEmailOtp.mockResolvedValue(undefined)
  verifyEmailOtp.mockClear()
  verifyEmailOtp.mockResolvedValue(undefined)
  getUser.mockClear()
  getUser.mockResolvedValue({ id: 'anon-uid' })
  requestAccountMerge.mockClear()
  requestAccountMerge.mockResolvedValue('merge-token')
  completeAccountMerge.mockClear()
  completeAccountMerge.mockResolvedValue(undefined)
  sendExistingAccountLoginOtp.mockClear()
  sendExistingAccountLoginOtp.mockResolvedValue(undefined)
  isEmailAlreadyRegisteredError.mockClear()
  isEmailAlreadyRegisteredError.mockReturnValue(false)
  track.mockClear()
  reportError.mockClear()
})

describe('useAccountUpgrade (issue #758, vincular anónimo → permanente)', () => {
  test('email inválido: no llama a linkAnonymousEmail y fija un error', async () => {
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
    act(() => result.current.setEmail('noesemail'))
    await act(async () => {
      await result.current.submit()
    })
    expect(linkAnonymousEmail).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/correo válido/i)
    expect(result.current.step).toBe('email')
  })

  test('email válido: llama a linkAnonymousEmail (NO a sendEmailOtp) y pasa a "code"', async () => {
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(async () => {
      await result.current.submit()
    })
    expect(linkAnonymousEmail).toHaveBeenCalledWith('lewis@ej.com')
    expect(result.current.step).toBe('code')
  })

  test('código inválido (no 6 dígitos): no llama a verifyLinkEmailOtp, devuelve false', async () => {
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
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
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
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

  // Issue #751: `account_upgraded` sin props no se podía cruzar con el resto
  // del funnel (qué superficie convierte). El contexto viaja desde el llamante
  // (AccountUpgradeModal ← PlayChallenge/App.tsx).
  describe('account_upgraded lleva el contexto de origen (issue #751)', () => {
    test('origin play_result con group_id/challenge_id', async () => {
      const { result } = renderHook(() =>
        useAccountUpgrade({ origin: 'play_result', groupId: 'g1', challengeId: 'c1' }),
      )
      act(() => result.current.setEmail('lewis@ej.com'))
      await act(async () => {
        await result.current.submit()
      })
      act(() => result.current.setCode('123456'))
      await act(async () => {
        await result.current.verify()
      })
      expect(track).toHaveBeenCalledWith('account_upgraded', {
        origin: 'play_result',
        group_id: 'g1',
        challenge_id: 'c1',
      })
    })

    test('origin anon_create_gate SIN group_id/challenge_id: no manda esas props', async () => {
      const { result } = renderHook(() => useAccountUpgrade({ origin: 'anon_create_gate' }))
      act(() => result.current.setEmail('lewis@ej.com'))
      await act(async () => {
        await result.current.submit()
      })
      act(() => result.current.setCode('123456'))
      await act(async () => {
        await result.current.verify()
      })
      expect(track).toHaveBeenCalledWith('account_upgraded', { origin: 'anon_create_gate' })
    })
  })

  test('código incorrecto/caducado: verify devuelve false y fija un error legible', async () => {
    verifyLinkEmailOtp.mockRejectedValueOnce(new Error('otp_expired'))
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
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

  // ── Fusión: el email YA pertenece a otra cuenta (issue #944) ───────────────
  describe('fusión de cuentas cuando el email ya existe (issue #944)', () => {
    beforeEach(() => {
      // El updateUser choca porque el correo ya está registrado y el detector lo
      // reconoce → el hook arranca el flujo de login + fusión.
      linkAnonymousEmail.mockRejectedValue({ code: 'email_exists', status: 422 })
      isEmailAlreadyRegisteredError.mockReturnValue(true)
    })

    async function goToMergeCode(result: { current: ReturnType<typeof useAccountUpgrade> }) {
      act(() => result.current.setEmail('lewis@ej.com'))
      await act(async () => {
        await result.current.submit()
      })
    }

    test('submit con email existente: pide token, manda OTP de login y entra en modo merge', async () => {
      const { result } = renderHook(() => useAccountUpgrade({ origin: 'anon_create_gate' }))
      await goToMergeCode(result)

      expect(requestAccountMerge).toHaveBeenCalledTimes(1)
      expect(sendExistingAccountLoginOtp).toHaveBeenCalledWith('lewis@ej.com')
      // NO se cae al error crudo: se avanza al paso de código en modo 'merge'.
      expect(result.current.step).toBe('code')
      expect(result.current.mode).toBe('merge')
      expect(result.current.error).toBeNull()
    })

    test('happy path: verifica el OTP de login y completa la fusión', async () => {
      const { result } = renderHook(() =>
        useAccountUpgrade({ origin: 'play_result', groupId: 'g1', challengeId: 'c1' }),
      )
      await goToMergeCode(result)
      act(() => result.current.setCode('123456'))
      let ok = false
      await act(async () => {
        ok = await result.current.verify()
      })

      expect(ok).toBe(true)
      // Entra en la cuenta EXISTENTE con el OTP de login (type 'email'), NO con el
      // de email_change de vincular.
      expect(verifyEmailOtp).toHaveBeenCalledWith('lewis@ej.com', '123456')
      expect(verifyLinkEmailOtp).not.toHaveBeenCalled()
      // Luego trae los datos del invitado con el uid+token capturados.
      expect(completeAccountMerge).toHaveBeenCalledWith('anon-uid', 'merge-token')
      expect(track).toHaveBeenCalledWith('account_upgraded', {
        origin: 'play_result',
        group_id: 'g1',
        challenge_id: 'c1',
        merged: true,
      })
    })

    test('OTP inválido: no completa la fusión y fija error legible', async () => {
      verifyEmailOtp.mockRejectedValueOnce(new Error('otp_expired'))
      const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
      await goToMergeCode(result)
      act(() => result.current.setCode('000000'))
      let ok = true
      await act(async () => {
        ok = await result.current.verify()
      })

      expect(ok).toBe(false)
      expect(completeAccountMerge).not.toHaveBeenCalled()
      expect(result.current.error).toMatch(/incorrecto o caducado/i)
    })

    test('OTP ok pero la fusión falla: no marca éxito y permite reintentar solo la RPC', async () => {
      completeAccountMerge.mockRejectedValueOnce(new Error('boom'))
      const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
      await goToMergeCode(result)
      act(() => result.current.setCode('123456'))

      let ok = true
      await act(async () => {
        ok = await result.current.verify()
      })
      expect(ok).toBe(false)
      expect(result.current.error).toMatch(/no pudimos traer/i)

      // Reporta a observabilidad el huérfano con source/target, SIN el token.
      expect(reportError).toHaveBeenCalledTimes(1)
      const [reportedErr, ctx] = reportError.mock.calls[0]
      expect(reportedErr).toBeInstanceOf(Error)
      expect(ctx).toMatchObject({
        area: 'account_merge_complete',
        source_uid: 'anon-uid',
        target_uid: 'anon-uid',
      })
      expect(JSON.stringify(ctx)).not.toContain('merge-token')

      // Reintento: el OTP ya se consumió, así que NO se vuelve a canjear; solo se
      // re-llama a la RPC de fusión, que ahora sí funciona.
      await act(async () => {
        ok = await result.current.verify()
      })
      expect(ok).toBe(true)
      expect(verifyEmailOtp).toHaveBeenCalledTimes(1)
      expect(completeAccountMerge).toHaveBeenCalledTimes(2)
    })

    test('pedir el token falla: no avanza y muestra error', async () => {
      requestAccountMerge.mockRejectedValueOnce(new Error('sin token'))
      const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
      await goToMergeCode(result)

      expect(sendExistingAccountLoginOtp).not.toHaveBeenCalled()
      expect(result.current.step).toBe('email')
      expect(result.current.error).toMatch(/acceso a tu cuenta/i)
    })
  })

  test('reset vuelve al paso de email y limpia el código/error', async () => {
    const { result } = renderHook(() => useAccountUpgrade({ origin: 'play_result' }))
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
