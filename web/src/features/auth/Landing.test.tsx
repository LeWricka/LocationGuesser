import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui'

// auth.ts importa ./supabase (lanza sin env). Mockeamos los helpers de OTP y el
// aviso de sesión legada (issue #514; sin aviso pendiente por defecto).
const sendOtp = vi.fn<(email: string, displayName?: string, redirectTo?: string) => Promise<void>>(
  async () => {},
)
const verifyOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
const takeLegacySessionNotice = vi.fn<() => boolean>(() => false)
vi.mock('../../lib/auth', () => ({
  sendEmailOtp: (email: string, displayName?: string, redirectTo?: string) =>
    sendOtp(email, displayName, redirectTo),
  verifyEmailOtp: (email: string, token: string) => verifyOtp(email, token),
  takeLegacySessionNotice: () => takeLegacySessionNotice(),
}))

import { Landing } from './Landing'

// Landing usa useToast (issue #514: aviso de sesión legada); lo envolvemos en
// ToastProvider para que el hook no lance fuera de contexto.
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
  takeLegacySessionNotice.mockClear()
  takeLegacySessionNotice.mockReturnValue(false)
})

afterEach(() => {
  window.location.hash = ''
})

describe('Landing (email-first, issue #506)', () => {
  test('la portada muestra hero + showcase + CTA único email-first', () => {
    renderLanding()
    // El hero lleva la frase ancla.
    expect(
      screen.getByRole('heading', { name: /Comparte tus momentos de una forma diferente/i }),
    ).toBeInTheDocument()
    // El showcase ENSEÑA capturas reales del producto.
    expect(screen.getByRole('heading', { name: 'Cada viaje deja su camino' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cada momento, en su sitio' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Adivina dónde es' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gana quien más se acerca' })).toBeInTheDocument()
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
    renderLanding()
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    // LoginFlow paso 'email': LoginScreen con el campo de correo.
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // Sin campo de nombre: el modelo email-first no pide nombre al enviar el código.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
  })

  test('"Atrás" desde el flujo de email vuelve a la landing', async () => {
    renderLanding()
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    // El LoginFlow tiene el botón "Atrás" que devuelve a la landing.
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByRole('button', { name: 'Empieza a compartir' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tu correo')).not.toBeInTheDocument()
  })

  test('email válido envía el OTP y pasa al paso del código', async () => {
    renderLanding()
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).toHaveBeenCalledWith('lewis@ej.com', undefined, undefined)
    // Pasa al paso del código.
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeInTheDocument()
  })

  test('email inválido no envía OTP y muestra error', async () => {
    renderLanding()
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    await userEvent.type(screen.getByLabelText('Tu correo'), 'noesemail')
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(sendOtp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i)
  })

  test('pasa el redirectTo al enviar el OTP (preserva auto-join por deep link)', async () => {
    renderLanding({ redirectTo: 'https://app.example/' })
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
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

  // Issue #514: AuthProvider cerró una sesión anónima legada (modelo pre-#507)
  // y dejó el aviso pendiente; Landing debe mostrarlo una vez al aterrizar.
  test('con aviso de sesión legada pendiente, muestra el toast de aviso', () => {
    takeLegacySessionNotice.mockReturnValue(true)
    renderLanding()
    expect(screen.getByText(/Hemos mejorado el acceso/i)).toBeInTheDocument()
  })

  test('sin aviso de sesión legada pendiente, no muestra el toast', () => {
    renderLanding()
    expect(screen.queryByText(/Hemos mejorado el acceso/i)).not.toBeInTheDocument()
  })
})
