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
const track = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

import { AccountUpgradeModal } from './AccountUpgradeModal'

beforeEach(() => {
  linkAnonymousEmail.mockClear()
  linkAnonymousEmail.mockResolvedValue(undefined)
  verifyLinkEmailOtp.mockClear()
  verifyLinkEmailOtp.mockResolvedValue(undefined)
  track.mockClear()
})

describe('AccountUpgradeModal (issue #758, "guárdate")', () => {
  test('cerrado: no pinta el diálogo', () => {
    render(<AccountUpgradeModal open={false} onClose={vi.fn()} origin="play_result" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('abierto: pide el correo; "Ahora no" cierra sin vincular', async () => {
    const onClose = vi.fn()
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={onClose} origin="play_result" />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu correo')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(linkAnonymousEmail).not.toHaveBeenCalled()
  })

  test('correo válido → código → confirmar: vincula y avisa con onUpgraded', async () => {
    const onUpgraded = vi.fn()
    const u = userEvent.setup()
    render(
      <AccountUpgradeModal open onClose={vi.fn()} onUpgraded={onUpgraded} origin="play_result" />,
    )

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
    render(
      <AccountUpgradeModal open onClose={vi.fn()} onUpgraded={onUpgraded} origin="play_result" />,
    )

    await u.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))
    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '000000')
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/incorrecto o caducado/i)).toBeInTheDocument()
    expect(onUpgraded).not.toHaveBeenCalled()
  })
})

// Issue #756: el copy se reencuadra al BENEFICIO (puntos del viaje) en vez de
// la burocracia de "cuenta", cuando el llamante trae `groupName`/`points`
// (viene de jugar un reto). Sin esos props, cae al copy genérico de progreso.
describe('AccountUpgradeModal — copy reencuadrado al beneficio (issue #756)', () => {
  test('con groupName + points: título y cuerpo mencionan el viaje y la cifra', () => {
    render(
      <AccountUpgradeModal
        open
        onClose={vi.fn()}
        origin="play_result"
        groupName="Viaje a Iruña"
        points={1500}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Guarda tus puntos de Viaje a Iruña' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1500 puntos/)).toBeInTheDocument()
  })

  test('sin groupName/points (p.ej. anon_create_gate): cae al copy genérico de progreso', () => {
    render(<AccountUpgradeModal open onClose={vi.fn()} origin="anon_create_gate" />)
    expect(screen.getByRole('heading', { name: 'Guarda tu cuenta' })).toBeInTheDocument()
    expect(screen.getByText(/Guarda tu progreso con tu correo/)).toBeInTheDocument()
  })

  // Título/intro a medida (issue #891): el gate del "+" anónimo pide cuenta con
  // su propio encuadre de "crear", sin tocar el copy de beneficio por defecto.
  test('title/intro a medida ganan al copy por defecto', () => {
    render(
      <AccountUpgradeModal
        open
        onClose={vi.fn()}
        origin="anon_create_gate"
        title="Regístrate para crear tus viajes"
        intro="Estás como invitado."
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Regístrate para crear tus viajes' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Estás como invitado.')).toBeInTheDocument()
    expect(screen.queryByText(/Guarda tu progreso con tu correo/)).not.toBeInTheDocument()
  })
})

// Issue #751: funnel del CTA — antes solo existía `account_upgraded` (el
// numerador), sin saber a cuánta gente se le ofreció ni cuántos lo cerraron
// sin completar.
describe('AccountUpgradeModal — funnel del CTA (issue #751)', () => {
  test('al abrir, emite upgrade_cta_shown con el origen y los ids', () => {
    render(
      <AccountUpgradeModal
        open
        onClose={vi.fn()}
        origin="play_result"
        groupId="g1"
        challengeId="c1"
      />,
    )
    expect(track).toHaveBeenCalledWith('upgrade_cta_shown', {
      origin: 'play_result',
      group_id: 'g1',
      challenge_id: 'c1',
    })
  })

  test('no repite upgrade_cta_shown en repintados mientras sigue abierto', () => {
    const { rerender } = render(
      <AccountUpgradeModal open onClose={vi.fn()} origin="anon_create_gate" />,
    )
    track.mockClear()
    rerender(<AccountUpgradeModal open onClose={vi.fn()} origin="anon_create_gate" />)
    expect(track).not.toHaveBeenCalledWith('upgrade_cta_shown', expect.anything())
  })

  test('"Ahora no" emite upgrade_abandoned antes de cerrar', async () => {
    const onClose = vi.fn()
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={onClose} origin="anon_create_gate" />)
    track.mockClear()

    await u.click(screen.getByRole('button', { name: 'Ahora no' }))

    expect(track).toHaveBeenCalledWith('upgrade_abandoned', { origin: 'anon_create_gate' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('vincular con éxito NO emite upgrade_abandoned', async () => {
    const u = userEvent.setup()
    render(<AccountUpgradeModal open onClose={vi.fn()} origin="play_result" groupId="g1" />)

    await u.type(screen.getByLabelText('Tu correo'), 'lewis@ej.com')
    await u.click(screen.getByRole('button', { name: 'Mandar código' }))
    const code = await screen.findByLabelText('Código de 6 dígitos')
    await u.type(code, '123456')
    track.mockClear()
    await u.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(track).not.toHaveBeenCalledWith('upgrade_abandoned', expect.anything())
  })
})
