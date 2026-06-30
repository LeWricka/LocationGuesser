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
  test('la portada es visual: hero + CTA + cómo funciona, sin email a la vista', () => {
    render(<Landing />)
    // El hero (h1) y la sección inmersiva (h2) comparten la frase ancla: hay
    // dos headings con ese texto, uno por nivel.
    expect(
      screen.getAllByRole('heading', {
        name: /Comparte tus momentos de una forma diferente/i,
      }).length,
    ).toBeGreaterThanOrEqual(1)
    // La sección inmersiva "cómo funciona" (eyebrow + los 3 pasos del bucle).
    expect(screen.getByText('Cómo funciona')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Comparte un momento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lo viven y adivinan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Queda en el viaje' })).toBeInTheDocument()
    // El CTA del hero abre el popup; el email NO está a la vista.
    expect(screen.getByRole('button', { name: 'Empieza' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
  })

  test('el CTA abre el popup con el campo de correo', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza' }))
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviarme el código' })).toBeInTheDocument()
  })

  test('en el deep-link "¿Ya tienes cuenta? Entra" abre el mismo popup', async () => {
    // Login y registro son el mismo flujo OTP: en la variante de invitación el enlace
    // "Entra" abre el mismo popup que el CTA primario.
    render(<Landing groupName="Finde Lisboa" />)
    await userEvent.click(screen.getByRole('button', { name: /Ya tienes cuenta/i }))
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
  })

  test('email inválido no llama a Supabase y muestra error', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el código' }))
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('correo válido')
  })

  test('email válido envía el código y pasa al paso del código', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el código' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('pasa el redirectTo al enviar el código', async () => {
    render(<Landing redirectTo="https://app.example/#g=abc" />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el código' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined, 'https://app.example/#g=abc')
  })

  test('con groupName adapta el copy del hero y el CTA a unirse al viaje', async () => {
    render(<Landing groupName="Finde Lisboa" />)
    expect(
      screen.getByRole('heading', { name: /Vive los viajes de Finde Lisboa/i }),
    ).toBeInTheDocument()
    // En el deep-link el viaje ya viene dado: no se ofrece el atajo de código.
    expect(screen.queryByRole('button', { name: 'Tengo un código' })).not.toBeInTheDocument()
    // El CTA invita a unirse y abre el popup con el copy de unirse.
    await userEvent.click(screen.getByRole('button', { name: 'Únete al viaje' }))
    expect(screen.getByRole('heading', { name: 'Entra y vive el viaje' })).toBeInTheDocument()
  })

  test('el atajo de código de viaje navega a #g=<código>', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Tengo un código' }))
    await userEvent.type(screen.getByLabelText('Código o enlace del viaje'), 'lisboa123')
    await userEvent.click(screen.getByRole('button', { name: 'Unirme al viaje' }))
    expect(window.location.hash).toBe('#g=lisboa123')
  })
})
