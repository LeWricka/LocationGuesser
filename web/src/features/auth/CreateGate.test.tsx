import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const resendMock = vi.fn<(redirectTo?: string) => Promise<void>>(async () => {})
vi.mock('../../lib/auth', () => ({
  resendEmailValidation: (redirectTo?: string) => resendMock(redirectTo),
}))

import { CreateGate } from './CreateGate'
import { ToastProvider } from '../../ui'

function renderGate(props: Partial<Parameters<typeof CreateGate>[0]> = {}) {
  const onBack = props.onBack ?? vi.fn()
  render(
    <ToastProvider>
      <CreateGate email={props.email ?? 'lewis@ej.com'} onBack={onBack} />
    </ToastProvider>,
  )
  return { onBack }
}

beforeEach(() => {
  resendMock.mockClear()
  resendMock.mockResolvedValue(undefined)
})

describe('CreateGate (valida tu correo para crear)', () => {
  test('muestra el mensaje de validar con el correo pendiente', () => {
    renderGate()
    expect(screen.getByRole('heading', { name: /valida tu correo/i })).toBeInTheDocument()
    expect(screen.getByText(/lewis@ej.com/)).toBeInTheDocument()
  })

  test('"Reenviar correo" reenvía la validación', async () => {
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar correo' }))
    expect(resendMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/reenviamos el enlace/i)).toBeInTheDocument()
  })

  test('"Volver" llama a onBack (no es callejón sin salida)', async () => {
    const { onBack } = renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(onBack).toHaveBeenCalled()
  })

  test('reenvío fallido avisa sin romper', async () => {
    resendMock.mockRejectedValue(new Error('red'))
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar correo' }))
    expect(await screen.findByText(/no pudimos reenviar/i)).toBeInTheDocument()
  })
})
