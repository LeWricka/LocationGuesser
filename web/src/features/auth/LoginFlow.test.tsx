import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// auth.ts importa ./supabase (lanza sin env). Mockeamos signInWithMagicLink.
const signIn = vi.fn<(email: string, displayName?: string, redirectTo?: string) => Promise<void>>(
  async () => {},
)
vi.mock('../../lib/auth', () => ({
  signInWithMagicLink: (email: string, displayName?: string, redirectTo?: string) =>
    signIn(email, displayName, redirectTo),
}))

import { LoginFlow } from './LoginFlow'

beforeEach(() => {
  signIn.mockClear()
})

describe('LoginFlow', () => {
  test('email inválido no llama a Supabase y muestra error', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace mágico' }))
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('correo válido')
  })

  test('email válido envía el enlace y pasa a "revisa tu correo"', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace mágico' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    expect(await screen.findByRole('heading', { name: 'Mira tu correo' })).toBeInTheDocument()
  })

  test('"cambiar email" vuelve a la pantalla de login', async () => {
    render(<LoginFlow />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace mágico' }))
    await screen.findByRole('heading', { name: 'Mira tu correo' })
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }))
    expect(screen.getByRole('heading', { name: 'Entra a LocationGuesser' })).toBeInTheDocument()
  })

  test('con groupName muestra el copy de unirse', () => {
    render(<LoginFlow groupName="Finde Lisboa" />)
    expect(screen.getByRole('heading', { name: 'Únete para jugar este reto' })).toBeInTheDocument()
  })
})
