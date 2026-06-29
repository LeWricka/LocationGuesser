import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// auth.ts importa ./supabase (lanza sin env). Mockeamos los helpers de OTP.
const signIn = vi.fn<(email: string, displayName?: string, redirectTo?: string) => Promise<void>>(
  async () => {},
)
vi.mock('../../lib/auth', () => ({
  sendEmailOtp: (email: string, displayName?: string, redirectTo?: string) =>
    signIn(email, displayName, redirectTo),
  verifyEmailOtp: vi.fn(async () => {}),
}))

import { Landing } from './Landing'

beforeEach(() => {
  signIn.mockClear()
})

afterEach(() => {
  window.location.hash = ''
})

describe('Landing', () => {
  test('muestra el hero y el formulario de entrada', () => {
    render(<Landing />)
    expect(
      screen.getByRole('heading', {
        name: /Que los que más quieres lo vivan contigo/i,
      }),
    ).toBeInTheDocument()
    // Los 3 pasos reutilizados de HowItWorks.
    expect(screen.getByRole('heading', { name: 'Cómo funciona' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
  })

  test('email inválido no llama a Supabase y muestra error', async () => {
    render(<Landing />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('correo válido')
  })

  test('email válido envía el código y pasa a la pantalla del código', async () => {
    render(<Landing />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('pasa el redirectTo al enviar el código', async () => {
    render(<Landing redirectTo="https://app.example/#g=abc" />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined, 'https://app.example/#g=abc')
  })

  test('con groupName adapta el copy del hero a unirse al grupo', () => {
    render(<Landing groupName="Finde Lisboa" />)
    expect(
      screen.getByRole('heading', { name: /Vive los viajes de Finde Lisboa/i }),
    ).toBeInTheDocument()
    // En el deep-link el grupo ya viene dado: no se ofrece el atajo de código.
    expect(screen.queryByText('¿Te han pasado un código de grupo?')).not.toBeInTheDocument()
  })

  test('el atajo de código de grupo navega a #g=<código>', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByText('¿Te han pasado un código de grupo?'))
    await userEvent.type(screen.getByLabelText('Código o enlace del grupo'), 'lisboa123')
    await userEvent.click(screen.getByRole('button', { name: 'Unirme al grupo' }))
    expect(window.location.hash).toBe('#g=lisboa123')
  })
})
