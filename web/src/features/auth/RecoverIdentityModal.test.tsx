import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// auth.ts importa ./supabase (lanza sin env vars). Mockeamos el login OTP
// normal (mismo que usa LoginFlow): aquí no se vincula nada, se ENTRA con una
// cuenta que puede ya existir.
const sendOtp = vi.fn<(email: string, displayName?: string, redirectTo?: string) => Promise<void>>(
  async () => {},
)
const verifyOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
vi.mock('../../lib/auth', () => ({
  sendEmailOtp: (email: string, displayName?: string, redirectTo?: string) =>
    sendOtp(email, displayName, redirectTo),
  verifyEmailOtp: (email: string, token: string) => verifyOtp(email, token),
}))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

import { RecoverIdentityModal } from './RecoverIdentityModal'

beforeEach(() => {
  sendOtp.mockClear()
  sendOtp.mockResolvedValue(undefined)
  verifyOtp.mockClear()
  verifyOtp.mockResolvedValue(undefined)
})

describe('RecoverIdentityModal — "¿Eres tú?" (issue #756)', () => {
  test('cerrado: no pinta el diálogo', () => {
    render(
      <RecoverIdentityModal
        open={false}
        matchedName="Ane"
        onClose={vi.fn()}
        onRecovered={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('abierto: menciona el nombre coincidente y pide el correo', () => {
    render(<RecoverIdentityModal open matchedName="Ane" onClose={vi.fn()} onRecovered={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Ya hay un/)).toHaveTextContent('Ane')
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
  })

  test('"Ahora no" cierra sin llamar a onRecovered', async () => {
    const onClose = vi.fn()
    const onRecovered = vi.fn()
    const u = userEvent.setup()
    render(
      <RecoverIdentityModal open matchedName="Ane" onClose={onClose} onRecovered={onRecovered} />,
    )

    await u.click(screen.getByRole('button', { name: 'Ahora no' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onRecovered).not.toHaveBeenCalled()
    expect(sendOtp).not.toHaveBeenCalled()
  })

  test('correo → código → confirmar: verifica el OTP normal y avisa con onRecovered', async () => {
    const onRecovered = vi.fn()
    const u = userEvent.setup()
    render(
      <RecoverIdentityModal open matchedName="Ane" onClose={vi.fn()} onRecovered={onRecovered} />,
    )

    await u.type(screen.getByLabelText('Tu correo'), 'ane@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))
    expect(sendOtp).toHaveBeenCalledWith('ane@ej.com', undefined, undefined)

    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '123456')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(verifyOtp).toHaveBeenCalledWith('ane@ej.com', '123456')
    expect(onRecovered).toHaveBeenCalledTimes(1)
  })

  test('código incorrecto: muestra error y NO llama a onRecovered', async () => {
    verifyOtp.mockRejectedValueOnce(new Error('otp_expired'))
    const onRecovered = vi.fn()
    const u = userEvent.setup()
    render(
      <RecoverIdentityModal open matchedName="Ane" onClose={vi.fn()} onRecovered={onRecovered} />,
    )

    await u.type(screen.getByLabelText('Tu correo'), 'ane@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))
    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '000000')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/incorrecto o caducado/i)).toBeInTheDocument()
    expect(onRecovered).not.toHaveBeenCalled()
  })
})
