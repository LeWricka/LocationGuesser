import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckEmail } from './CheckEmail'

describe('CheckEmail', () => {
  test('muestra el email al que se envió el enlace', () => {
    render(<CheckEmail email="lewis@ejemplo.com" />)
    expect(screen.getByText('lewis@ejemplo.com')).toBeInTheDocument()
  })

  test('reenviar y cambiar email disparan sus callbacks', async () => {
    const onResend = vi.fn()
    const onChangeEmail = vi.fn()
    render(<CheckEmail email="x@y.com" onResend={onResend} onChangeEmail={onChangeEmail} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }))
    expect(onResend).toHaveBeenCalledOnce()
    expect(onChangeEmail).toHaveBeenCalledOnce()
  })

  test('resending muestra el botón ocupado', () => {
    render(<CheckEmail email="x@y.com" resending />)
    expect(screen.getByRole('button', { name: /Reenviar/ })).toBeDisabled()
  })
})
