import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui'

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

function renderLanding(props: Parameters<typeof Landing>[0] = {}) {
  return render(
    <ToastProvider>
      <Landing {...props} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  sendOtp.mockClear()
  verifyOtp.mockClear()
})

afterEach(() => {
  window.location.hash = ''
})

describe('Landing (email-first, issue #506)', () => {
  test('la portada muestra hero + narrativa en dos partes + CTA único email-first', () => {
    renderLanding()
    // El hero lleva la frase ancla.
    expect(
      screen.getByRole('heading', { name: /Comparte tus viajes de una forma diferente/i }),
    ).toBeInTheDocument()
    // Narrativa en dos partes (issue #731, reorientación de la Parte 2 en #733):
    // Parte 1 "Guarda el viaje" (la esencia) y Parte 2 "Y lo viven contigo"
    // (compartir; jugar es solo una forma), cada una con capturas reales.
    expect(
      screen.getByRole('heading', { name: 'Guarda el viaje mientras lo vives' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Foto, clip o audio')).toBeInTheDocument()
    expect(screen.getByText('Cada momento, en un lugar')).toBeInTheDocument()
    expect(screen.getByText('Bitácora de viaje')).toBeInTheDocument()
    expect(screen.getByAltText(/Bitácora de un viaje bien llena/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Y lo viven contigo' })).toBeInTheDocument()
    expect(screen.getByText('Comparte el viaje')).toBeInTheDocument()
    expect(screen.getByText('Reta a tus amigos')).toBeInTheDocument()
    expect(screen.getByText('Clasificación y premios')).toBeInTheDocument()
    expect(screen.getByAltText(/Pantalla de jugar un reto/i)).toBeInTheDocument()
    // Para-quién + gancho del juego en el héroe (issue #916).
    expect(screen.getByText('Para tu grupo de viaje')).toBeInTheDocument()
    expect(screen.getByText(/adivinar dónde es cada una/i)).toBeInTheDocument()
    // CTA primario "Empieza a compartir" (en el hero y al cierre de la narrativa) +
    // CTA secundario "Ver un ejemplo" en el hero (issue #916). SIN dos CTAs separados
    // de signup/login.
    expect(screen.getAllByRole('button', { name: 'Empieza a compartir' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ver un ejemplo' })).toBeInTheDocument()
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

  test('"Ver un ejemplo" navega al viaje de ejemplo con guía y origen landing', async () => {
    renderLanding()
    await userEvent.click(screen.getByTestId('see-example'))
    // Enruta por hash (App lo intercepta sin sesión): #g=ejemplo&tour=1&from=landing.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    expect(params.get('g')).toBe('ejemplo')
    expect(params.get('tour')).toBe('1')
    expect(params.get('from')).toBe('landing')
  })

  test('"Empieza a compartir" abre el flujo de email (LoginFlow)', async () => {
    renderLanding()
    await userEvent.click(screen.getByTestId('open-auth'))
    // LoginFlow paso 'email': LoginScreen con el campo de correo.
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // Sin campo de nombre: el modelo email-first no pide nombre al enviar el código.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
  })

  test('"Atrás" desde el flujo de email vuelve a la landing', async () => {
    renderLanding()
    await userEvent.click(screen.getByTestId('open-auth'))
    await expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // El LoginFlow tiene el botón "Atrás" que devuelve a la landing.
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByTestId('open-auth')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
  })

  test('email válido envía el OTP y pasa al paso del código', async () => {
    renderLanding()
    await userEvent.click(screen.getByTestId('open-auth'))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    // Pasa al paso del código.
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('email inválido no envía OTP y muestra error', async () => {
    renderLanding()
    await userEvent.click(screen.getByTestId('open-auth'))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i)
  })

  test('pasa el redirectTo al enviar el OTP (preserva auto-join por deep link)', async () => {
    renderLanding({ redirectTo: 'https://app.example/' })
    await userEvent.click(screen.getByTestId('open-auth'))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, 'https://app.example/')
  })

  test('con groupName adapta el copy del hero y muestra CTA de unirse', () => {
    renderLanding({ groupName: 'Finde Lisboa' })
    expect(
      screen.getByRole('heading', { name: /Vive los viajes de Finde Lisboa/i }),
    ).toBeInTheDocument()
    // CTA de unirse (en vez del genérico).
    expect(screen.getByRole('button', { name: 'Únete al viaje' })).toBeInTheDocument()
    // Sin "Ver un ejemplo" en el flujo de invitación: ya vienen a un viaje real.
    expect(screen.queryByRole('button', { name: 'Ver un ejemplo' })).not.toBeInTheDocument()
    // Sin CTAs del modelo antiguo.
    expect(screen.queryByRole('button', { name: /Tengo un código/i })).not.toBeInTheDocument()
    // Sin nota de enlace en el flujo de invitación (ya vienen al viaje).
    expect(screen.queryByText(/Te han pasado un enlace/i)).not.toBeInTheDocument()
  })

  test('con groupName "Únete al viaje" abre el flujo de email con copy de invitación', async () => {
    renderLanding({ groupName: 'Finde Lisboa' })
    await userEvent.click(screen.getByRole('button', { name: 'Únete al viaje' }))
    // LoginFlow en contexto de grupo: copy "Únete para jugar este reto".
    expect(screen.getByRole('heading', { name: 'Únete para jugar este reto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // Sin campo de nombre.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
  })
})
