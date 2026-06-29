import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnterCode } from './EnterCode'

describe('EnterCode', () => {
  test('muestra el email al que se envió el código', () => {
    render(<EnterCode email="lewis@ejemplo.com" code="" onCodeChange={() => {}} />)
    expect(screen.getByText('lewis@ejemplo.com')).toBeInTheDocument()
  })

  test('el input del código es accesible (numérico, one-time-code)', () => {
    render(<EnterCode email="x@y.com" code="" onCodeChange={() => {}} />)
    const input = screen.getByLabelText('Código de 6 dígitos')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
  })

  test('solo deja dígitos y como mucho 6', async () => {
    const onCodeChange = vi.fn()
    render(<EnterCode email="x@y.com" code="" onCodeChange={onCodeChange} />)
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), 'a1b2')
    // Cada pulsación pasa por el saneado: las letras se descartan.
    expect(onCodeChange).toHaveBeenLastCalledWith('2')
  })

  test('enviar el formulario dispara onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<EnterCode email="x@y.com" code="123456" onCodeChange={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  test('reenviar y cambiar email disparan sus callbacks', async () => {
    const onResend = vi.fn()
    const onChangeEmail = vi.fn()
    render(
      <EnterCode
        email="x@y.com"
        code=""
        onCodeChange={() => {}}
        onResend={onResend}
        onChangeEmail={onChangeEmail}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }))
    expect(onResend).toHaveBeenCalledOnce()
    expect(onChangeEmail).toHaveBeenCalledOnce()
  })

  test('la cabecera ofrece un "volver" (Cambiar correo) que no deja sin salida', async () => {
    const onChangeEmail = vi.fn()
    render(
      <EnterCode email="x@y.com" code="" onCodeChange={() => {}} onChangeEmail={onChangeEmail} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))
    expect(onChangeEmail).toHaveBeenCalledOnce()
  })

  test('muestra el error de verificación', () => {
    render(
      <EnterCode email="x@y.com" code="0000" onCodeChange={() => {}} error="Código incorrecto" />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Código incorrecto')
  })
})
