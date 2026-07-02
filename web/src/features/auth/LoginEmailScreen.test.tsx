import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LoginResult } from '../../lib/auth'

// Mockeamos signInExistingUser antes de importar el componente.
const signIn = vi.fn<(email: string, redirectTo?: string) => Promise<LoginResult>>(async () => ({
  kind: 'sent',
}))
vi.mock('../../lib/auth', () => ({
  signInExistingUser: (email: string, redirectTo?: string) => signIn(email, redirectTo),
}))

import { LoginEmailScreen } from './LoginEmailScreen'

beforeEach(() => {
  signIn.mockClear()
  signIn.mockResolvedValue({ kind: 'sent' })
})

describe('LoginEmailScreen (login solo email)', () => {
  test('muestra "Bienvenido de vuelta" y solo el campo de correo (sin nombre)', () => {
    render(<LoginEmailScreen />)
    expect(screen.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviarme el enlace' })).toBeInTheDocument()
  })

  test('email inválido no llama a Supabase y muestra error', async () => {
    render(<LoginEmailScreen />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/)
  })

  test('email válido → estado "sent" con mensaje de revisión', async () => {
    render(<LoginEmailScreen />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined)
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(screen.getByText(/lewis@ej.com/)).toBeInTheDocument()
  })

  test('"Usar otro correo" desde "sent" vuelve al formulario', async () => {
    render(<LoginEmailScreen />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    await screen.findByRole('heading', { name: 'Revisa tu correo' })
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro correo' }))
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
  })

  test('email no encontrado → "No encontramos esa cuenta" + opción crear', async () => {
    signIn.mockResolvedValue({ kind: 'not-found' })
    render(<LoginEmailScreen onSignUp={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'nuevo@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(
      await screen.findByRole('heading', { name: 'No encontramos esa cuenta' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()
  })

  test('"Crear cuenta" llama a onSignUp', async () => {
    signIn.mockResolvedValue({ kind: 'not-found' })
    const onSignUp = vi.fn()
    render(<LoginEmailScreen onSignUp={onSignUp} />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'nuevo@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Crear cuenta' }))
    expect(onSignUp).toHaveBeenCalledOnce()
  })

  test('con onBack pinta el control de volver', async () => {
    const onBack = vi.fn()
    render(<LoginEmailScreen onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  test('pasa el redirectTo a signInExistingUser', async () => {
    render(<LoginEmailScreen redirectTo="https://app.example/#g=abc" />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', 'https://app.example/#g=abc')
  })
})
