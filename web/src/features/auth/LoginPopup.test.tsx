import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnterResult } from '../../lib/auth'

// La entrada real la hace lib/auth.enterWithNameAndEmail; aquí testeamos el wiring
// del popup (validación, estados, caso email-ya-registrado). Mockeamos esa función.
const enterMock = vi.fn<(name: string, email: string, redirectTo?: string) => Promise<EnterResult>>(
  async () => ({ kind: 'entered' }),
)
vi.mock('../../lib/auth', () => ({
  enterWithNameAndEmail: (name: string, email: string, redirectTo?: string) =>
    enterMock(name, email, redirectTo),
}))

import { LoginPopup } from './LoginPopup'

beforeEach(() => {
  enterMock.mockClear()
  enterMock.mockResolvedValue({ kind: 'entered' })
})

describe('LoginPopup (entrada nombre + email)', () => {
  test('muestra los campos de nombre y correo, sin código', () => {
    render(<LoginPopup open onClose={() => {}} />)
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
  })

  test('nombre corto no entra y avisa', async () => {
    render(<LoginPopup open onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'L')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
  })

  test('email inválido no entra y avisa', async () => {
    render(<LoginPopup open onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i)
  })

  test('nombre + email válidos llaman a entrar (dentro al instante)', async () => {
    render(<LoginPopup open onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).toHaveBeenCalledWith('Lewis', 'lewis@ej.com', undefined)
  })

  test('email ya registrado → muestra el aviso de recuperación', async () => {
    enterMock.mockResolvedValue({ kind: 'email-exists' })
    render(<LoginPopup open onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'ya@existe.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText(/ya tiene una cuenta/i)).toBeInTheDocument()
    expect(screen.getByText(/ya@existe.com/)).toBeInTheDocument()
    // Puede volver al formulario para probar otro correo (no es callejón sin salida).
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro correo' }))
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
  })

  test('copy de unirse cuando se llega por invitación', () => {
    render(<LoginPopup open onClose={() => {}} joining />)
    expect(screen.getByRole('button', { name: 'Únete al viaje' })).toBeInTheDocument()
  })
})
