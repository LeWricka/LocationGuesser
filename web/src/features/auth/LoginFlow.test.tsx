import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// auth.ts importa ./supabase (lanza sin env). Mockeamos los helpers de OTP.
const sendOtp = vi.fn<(email: string, displayName?: string, redirectTo?: string) => Promise<void>>(
  async () => {},
)
const verifyOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
vi.mock('../../lib/auth', () => ({
  sendEmailOtp: (email: string, displayName?: string, redirectTo?: string) =>
    sendOtp(email, displayName, redirectTo),
  verifyEmailOtp: (email: string, token: string) => verifyOtp(email, token),
}))

import { LoginFlow } from './LoginFlow'

beforeEach(() => {
  sendOtp.mockClear()
  verifyOtp.mockClear()
})

describe('LoginFlow', () => {
  test('email inválido no llama a Supabase y muestra error', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('correo válido')
  })

  test('email válido envía el código y pasa a la pantalla del código', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('teclear el código y "Entrar" lo verifica', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(await screen.findByLabelText('Código de 6 dígitos'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(verifyOtp).toHaveBeenCalledWith('lewis@ej.com', '123456')
  })

  test('un código no numérico/incompleto no verifica y avisa', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(await screen.findByLabelText('Código de 6 dígitos'), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('6 dígitos')
  })

  test('"cambiar email" vuelve a la pantalla de login', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await screen.findByLabelText('Código de 6 dígitos')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }))
    expect(screen.getByRole('heading', { name: 'Entra a LocationGuesser' })).toBeInTheDocument()
  })

  test('con groupName muestra el copy de unirse', () => {
    render(<LoginFlow groupName="Finde Lisboa" />)
    expect(screen.getByRole('heading', { name: 'Únete para jugar este reto' })).toBeInTheDocument()
  })
})
