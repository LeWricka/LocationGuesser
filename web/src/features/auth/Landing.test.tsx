import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EnterResult, LoginResult } from '../../lib/auth'

// auth.ts importa ./supabase (lanza sin env). Mockeamos las dos funciones de auth:
// enterWithNameAndEmail (alta) y signInExistingUser (login).
const enter = vi.fn<(name: string, email: string, redirectTo?: string) => Promise<EnterResult>>(
  async () => ({ kind: 'entered' }),
)
const signIn = vi.fn<(email: string, redirectTo?: string) => Promise<LoginResult>>(
  async () => ({ kind: 'sent' }),
)
vi.mock('../../lib/auth', () => ({
  enterWithNameAndEmail: (name: string, email: string, redirectTo?: string) =>
    enter(name, email, redirectTo),
  signInExistingUser: (email: string, redirectTo?: string) => signIn(email, redirectTo),
}))

import { Landing } from './Landing'

beforeEach(() => {
  enter.mockClear()
  enter.mockResolvedValue({ kind: 'entered' })
  signIn.mockClear()
  signIn.mockResolvedValue({ kind: 'sent' })
})

afterEach(() => {
  window.location.hash = ''
})

describe('Landing', () => {
  test('la portada muestra hero + showcase + CTA principal, sin email a la vista', () => {
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
    // CTA principal + CTA login presentes; email NO a la vista aún.
    expect(screen.getByRole('button', { name: 'Crear tu viaje' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ya tengo cuenta · Entrar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
    // "Tengo un código" eliminado (#495): los viajes van por enlace.
    expect(screen.queryByRole('button', { name: /Tengo un código/i })).not.toBeInTheDocument()
    // La nota de enlace está visible.
    expect(screen.getByText(/Te han pasado un enlace/i)).toBeInTheDocument()
  })

  test('"Crear tu viaje" abre el alta con campos nombre y correo', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear tu viaje' }))
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    // El alta no tiene paso de código OTP.
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
  })

  test('"Ya tengo cuenta · Entrar" abre el login con solo el campo correo', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta · Entrar' }))
    // Solo correo: el login no pide nombre.
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviarme el enlace' })).toBeInTheDocument()
  })

  test('login: email válido envía magic link y muestra aviso "Revisa tu correo"', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta · Entrar' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(signIn).toHaveBeenCalledWith('lewis@ej.com', undefined)
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
  })

  test('login: email no encontrado muestra opción de crear cuenta', async () => {
    signIn.mockResolvedValue({ kind: 'not-found' })
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta · Entrar' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'nuevo@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    expect(
      await screen.findByRole('heading', { name: 'No encontramos esa cuenta' }),
    ).toBeInTheDocument()
    // Ofrece ir al alta.
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()
  })

  test('login: "No encontramos esa cuenta" → "Crear cuenta" lleva al alta', async () => {
    signIn.mockResolvedValue({ kind: 'not-found' })
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta · Entrar' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'nuevo@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviarme el enlace' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Crear cuenta' }))
    // Ha navegado al alta: aparecen los campos de nombre + correo.
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
  })

  test('email inválido en el alta no entra y muestra error', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear tu viaje' }))
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enter).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('correo válido')
  })

  test('alta: nombre + email válidos entran al instante', async () => {
    render(<Landing />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear tu viaje' }))
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enter).toHaveBeenCalledWith('Lewis', 'lewis@ej.com', undefined)
  })

  test('alta: pasa el redirectTo al entrar (preserva auto-join por deep link)', async () => {
    render(<Landing redirectTo="https://app.example/#g=abc" />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear tu viaje' }))
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Lewis')
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(enter).toHaveBeenCalledWith('Lewis', 'lewis@ej.com', 'https://app.example/#g=abc')
  })

  test('con groupName adapta el copy del hero y muestra "¿Ya tienes cuenta? Entra"', () => {
    render(<Landing groupName="Finde Lisboa" />)
    expect(
      screen.getByRole('heading', { name: /Vive los viajes de Finde Lisboa/i }),
    ).toBeInTheDocument()
    // CTA primario y secundario con copy de invitación.
    expect(screen.getByRole('button', { name: 'Únete al viaje' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '¿Ya tienes cuenta? Entra' })).toBeInTheDocument()
    // "Tengo un código" nunca aparece (ni en invitación ni en genérica).
    expect(screen.queryByRole('button', { name: /Tengo un código/i })).not.toBeInTheDocument()
    // La nota de enlace tampoco: ya viene al viaje concreto.
    expect(screen.queryByText(/Te han pasado un enlace/i)).not.toBeInTheDocument()
  })

  test('con groupName "Únete al viaje" abre el alta con copy de unirse', async () => {
    render(<Landing groupName="Finde Lisboa" />)
    await userEvent.click(screen.getByRole('button', { name: 'Únete al viaje' }))
    expect(screen.getByRole('heading', { name: 'Entra y vive el viaje' })).toBeInTheDocument()
  })

  test('con groupName "¿Ya tienes cuenta? Entra" abre el login (solo correo)', async () => {
    render(<Landing groupName="Finde Lisboa" />)
    await userEvent.click(screen.getByRole('button', { name: '¿Ya tienes cuenta? Entra' }))
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
  })
})
