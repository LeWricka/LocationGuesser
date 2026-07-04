import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  test('sin contexto de grupo usa el copy genérico', () => {
    render(<LoginScreen email="" onEmailChange={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Entra a Momentu' })).toBeInTheDocument()
  })

  test('con groupName usa el copy de "únete para jugar"', () => {
    render(<LoginScreen email="" onEmailChange={() => {}} groupName="Finde Lisboa" />)
    expect(screen.getByRole('heading', { name: 'Únete para jugar este reto' })).toBeInTheDocument()
    expect(screen.getByText('Finde Lisboa')).toBeInTheDocument()
  })

  test('escribir en el email llama a onEmailChange', async () => {
    const onEmailChange = vi.fn()
    render(<LoginScreen email="" onEmailChange={onEmailChange} />)
    await userEvent.type(screen.getByLabelText('Tu correo'), 'a')
    expect(onEmailChange).toHaveBeenCalledWith('a')
  })

  test('enviar el formulario dispara onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<LoginScreen email="lewis@x.com" onEmailChange={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza a compartir' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  test('muestra el error de validación', () => {
    render(<LoginScreen email="x" onEmailChange={() => {}} error="Email no válido" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Email no válido')
  })
})
