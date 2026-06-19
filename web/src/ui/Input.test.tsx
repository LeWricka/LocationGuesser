import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input', () => {
  test('refleja value y dispara onChange al escribir', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Input value="" placeholder="nombre" onChange={onChange} />)
    const input = screen.getByPlaceholderText('nombre')
    expect(input).toHaveValue('')
    await user.type(input, 'a')
    expect(onChange).toHaveBeenCalled()
  })

  test('invalid marca aria-invalid y añade la clase de error', () => {
    render(<Input invalid placeholder="campo" />)
    const input = screen.getByPlaceholderText('campo')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.className).toMatch(/invalid/)
  })

  test('sin invalid no marca aria-invalid', () => {
    render(<Input placeholder="ok" />)
    expect(screen.getByPlaceholderText('ok')).not.toHaveAttribute('aria-invalid')
  })

  test('reenvía atributos nativos (type, maxLength)', () => {
    render(<Input type="email" maxLength={5} placeholder="mail" />)
    const input = screen.getByPlaceholderText('mail')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('maxLength', '5')
  })
})
