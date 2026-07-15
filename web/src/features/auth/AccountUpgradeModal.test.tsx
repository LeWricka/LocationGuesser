import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// lib/auth.ts importa ./supabase (lanza sin env vars); mockeamos los dos
// helpers de vincular anónimo → permanente (issue #758).
const linkAnonymousEmail = vi.fn<(email: string) => Promise<void>>(async () => {})
const verifyLinkEmailOtp = vi.fn<(email: string, token: string) => Promise<void>>(async () => {})
vi.mock('../../lib/auth', () => ({
  linkAnonymousEmail: (email: string) => linkAnonymousEmail(email),
  verifyLinkEmailOtp: (email: string, token: string) => verifyLinkEmailOtp(email, token),
}))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

import { AccountUpgradeModal } from './AccountUpgradeModal'

beforeEach(() => {
  linkAnonymousEmail.mockClear()
  linkAnonymousEmail.mockResolvedValue(undefined)
  verifyLinkEmailOtp.mockClear()
  verifyLinkEmailOtp.mockResolvedValue(undefined)
})

describe('AccountUpgradeModal (issue #758, "guárdate")', () => {
  test('cerrado: no pinta el diálogo', () => {
    render(<AccountUpgradeModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('abierto: pide el correo; "Ahora no" cierra sin vincular', async () => {
    const onClose = vi.fn()
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={onClose} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(linkAnonymousEmail).not.toHaveBeenCalled()
  })

  test('correo válido → código → confirmar: vincula y avisa con onUpgraded', async () => {
    const onUpgraded = vi.fn()
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={vi.fn()} onUpgraded={onUpgraded} />)

    await u.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))

    expect(linkAnonymousEmail).toHaveBeenCalledWith('lewis@ej.com')
    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '123456')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(verifyLinkEmailOtp).toHaveBeenCalledWith('lewis@ej.com', '123456')
    expect(onUpgraded).toHaveBeenCalledTimes(1)
  })

  test('código incorrecto: muestra error y NO llama a onUpgraded', async () => {
    verifyLinkEmailOtp.mockRejectedValueOnce(new Error('otp_expired'))
    const onUpgraded = vi.fn()
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={vi.fn()} onUpgraded={onUpgraded} />)

    await u.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))
    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '000000')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/incorrecto o caducado/i)).toBeInTheDocument()
    expect(onUpgraded).not.toHaveBeenCalled()
  })
})
