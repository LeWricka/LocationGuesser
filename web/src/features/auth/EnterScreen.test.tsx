import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnterResult } from '../../lib/auth'

// La entrada real la hace lib/auth.enterWithNameAndEmail; aquí testeamos el wiring
// de la pantalla (validación, estados, caso email-ya-registrado). Mockeamos esa función.
const enterMock = vi.fn<(name: string, email: string, redirectTo?: string) => Promise<EnterResult>>(
  async () => ({ kind: 'entered' }),
)
vi.mock('../../lib/auth', () => ({
  enterWithNameAndEmail: (name: string, email: string, redirectTo?: string) =>
    enterMock(name, email, redirectTo),
}))

import { EnterScreen } from './EnterScreen'

beforeEach(() => {
  enterMock.mockClear()
  enterMock.mockResolvedValue({ kind: 'entered' })
})

describe('EnterScreen (entrada nombre + email, pantalla completa)', () => {
  test('muestra la frase ancla, los campos nombre y correo, sin código', () => {
    render(<EnterScreen />)
    expect(
      screen.getByRole('heading', { name: /Comparte tus momentos de una forma diferente/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
  })

  test('nombre corto no entra y avisa', async () => {
    render(<EnterScreen />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'L')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
  })

  test('email inválido no entra y avisa', async () => {
    render(<EnterScreen />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i)
  })

  test('nombre + email válidos llaman a entrar (dentro al instante)', async () => {
    render(<EnterScreen />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).toHaveBeenCalledWith('Lewis', 'lewis@ej.com', undefined)
  })

  test('pasa el redirectTo al entrar (preserva el auto-join por deep link)', async () => {
    render(<EnterScreen redirectTo="https://app.example/#g=abc" />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enterMock).toHaveBeenCalledWith('Lewis', 'lewis@ej.com', 'https://app.example/#g=abc')
  })

  test('email ya registrado → muestra el aviso de recuperación y deja volver', async () => {
    enterMock.mockResolvedValue({ kind: 'email-exists' })
    render(<EnterScreen />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'ya@existe.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText(/ya tiene una cuenta/i)).toBeInTheDocument()
    expect(screen.getByText(/ya@existe.com/)).toBeInTheDocument()
    // No es callejón sin salida: se puede volver al formulario para otro correo.
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro correo' }))
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
  })

  test('con joining el CTA invita a unirse al viaje', () => {
    render(<EnterScreen joining />)
    expect(screen.getByRole('button', { name: 'Únete al viaje' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Entra y vive el viaje' })).toBeInTheDocument()
  })

  test('con onBack pinta el control de volver', async () => {
    const onBack = vi.fn()
    render(<EnterScreen onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
