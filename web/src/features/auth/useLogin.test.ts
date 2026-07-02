import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mockeamos signInExistingUser antes de importar useLogin.
const signIn = vi.fn<(email: string, redirectTo?: string) => Promise<{ kind: string }>>()
vi.mock('../../lib/auth', () => ({
  signInExistingUser: (email: string, redirectTo?: string) => signIn(email, redirectTo),
}))

import { useLogin } from './useLogin'

beforeEach(() => {
  signIn.mockClear()
  signIn.mockResolvedValue({ kind: 'sent' })
})

describe('useLogin', () => {
  test('estado inicial: form con campos vacíos', () => {
    const { result } = renderHook(() => useLogin())
    expect(result.current.step).toBe('form')
    expect(result.current.email).toBe('')
    expect(result.current.error).toBeNull()
  })

  test('email inválido no llama a Supabase y muestra error', async () => {
    const { result } = renderHook(() => useLogin())
    act(() => result.current.setEmail('noesemail'))
    await act(() => result.current.submit())
    expect(signIn).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/correo válido/)
    expect(result.current.step).toBe('form')
  })

  test('email válido con cuenta existente → paso "sent"', async () => {
    const { result } = renderHook(() => useLogin())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(() => result.current.submit())
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined)
    expect(result.current.step).toBe('sent')
    expect(result.current.error).toBeNull()
  })

  test('email sin cuenta → paso "not-found"', async () => {
    signIn.mockResolvedValue({ kind: 'not-found' })
    const { result } = renderHook(() => useLogin())
    act(() => result.current.setEmail('nuevo@ej.com'))
    await act(() => result.current.submit())
    expect(result.current.step).toBe('not-found')
  })

  test('error de red → mensaje de error, sigue en "form"', async () => {
    signIn.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useLogin())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(() => result.current.submit())
    expect(result.current.step).toBe('form')
    expect(result.current.error).toMatch(/conexión/)
  })

  test('reset vuelve al formulario y limpia el error', async () => {
    signIn.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useLogin())
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(() => result.current.submit())
    expect(result.current.error).not.toBeNull()
    act(() => result.current.reset())
    expect(result.current.step).toBe('form')
    expect(result.current.error).toBeNull()
  })

  test('pasa redirectTo a signInExistingUser', async () => {
    const { result } = renderHook(() => useLogin({ redirectTo: 'https://app.example/#g=abc' }))
    act(() => result.current.setEmail('lewis@ej.com'))
    await act(() => result.current.submit())
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', 'https://app.example/#g=abc')
  })
})
