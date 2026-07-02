import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
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

import { Landing } from './Landing'

beforeEach(() => {
  sendOtp.mockClear()
  verifyOtp.mockClear()
})

afterEach(() => {
  window.location.hash = ''
})

describe('Landing (email-first, issue #506)', () => {
  test('la portada muestra hero + showcase + CTA único email-first', () => {
    render(<Landing />)
    // El hero lleva la frase ancla.
    expect(
      screen.getByRole('heading', { name: /Comparte tus momentos de una forma diferente/i }),
    ).toBeInTheDocument()
    // El showcase ENSEÑA capturas reales del producto.
    expect(screen.getByRole('heading', { name: 'Todo el viaje en un globo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gana quien más se acerca' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Un marcador que os une' })).toBeInTheDocument()
    expect(screen.getByAltText(/Pantalla de inicio de Tabide/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Así funciona Tabide' })).toBeInTheDocument()
    // CTA único: "Empieza a compartir". SIN dos CTAs separados.
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
    // Ya NO hay separación signup/login.
    expect(screen.queryByRole('button', { name: 'Crear tu viaje' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ya tengo cuenta · Entrar' }),
    ).not.toBeInTheDocument()
    // Email no visible todavía.
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
    // "Tengo un código" eliminado.
    expect(screen.queryByRole('button', { name: /Tengo un código/i })).not.toBeInTheDocument()
    // La nota de enlace está visible.
    expect(screen.getByText(/Te han pasado un enlace/i)).toBeInTheDocument()
  })

  test('"Empieza a compartir" abre el flujo de email (LoginFlow)', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    // LoginFlow paso 'email': LoginScreen con el campo de correo.
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // Sin campo de nombre: el modelo email-first no pide nombre al enviar el código.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
  })

  test('"Atrás" desde el flujo de email vuelve a la landing', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // El LoginFlow tiene el botón "Atrás" que devuelve a la landing.
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
  })

  test('email válido envía el OTP y pasa al paso del código', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    // Pasa al paso del código.
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('email inválido no envía OTP y muestra error', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i)
  })

  test('pasa el redirectTo al enviar el OTP (preserva auto-join por deep link)', async () => {
    render(<Landing redirectTo="https://app.example/" />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, 'https://app.example/')
  })

  test('con groupName adapta el copy del hero y muestra CTA de unirse', () => {
    render(<Landing groupName="Finde Lisboa" />)
    expect(
      screen.getByRole('heading', { name: /Vive los viajes de Finde Lisboa/i }),
    ).toBeInTheDocument()
    // CTA de unirse (en vez del genérico).
    expect(screen.getByRole('button', { name: 'Únete al viaje' })).toBeInTheDocument()
    // Sin CTAs del modelo antiguo.
    expect(screen.queryByRole('button', { name: /Tengo un código/i })).not.toBeInTheDocument()
    // Sin nota de enlace en el flujo de invitación (ya vienen al viaje).
    expect(screen.queryByText(/Te han pasado un enlace/i)).not.toBeInTheDocument()
  })

  test('con groupName "Únete al viaje" abre el flujo de email con copy de invitación', async () => {
    render(<Landing groupName="Finde Lisboa" />)
    await userEvent.click(screen.getByRole('button', { name: 'Únete al viaje' }))
    // LoginFlow en contexto de grupo: copy "Únete para jugar este reto".
    expect(screen.getByRole('heading', { name: 'Únete para jugar este reto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // Sin campo de nombre.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
  })
})
