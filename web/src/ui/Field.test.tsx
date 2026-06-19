import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'
import { Input } from './Input'

describe('Field', () => {
  test('cablea label e input por id (clic en label enfoca el input)', () => {
    render(<Field label="Tu nombre">{(p) => <Input {...p} />}</Field>)
    // getByLabelText resuelve la asociación label↔control vía htmlFor/id.
    const input = screen.getByLabelText('Tu nombre')
    expect(input.tagName).toBe('INPUT')
  })

  test('sin error no marca aria-invalid ni muestra alerta', () => {
    render(<Field label="Email">{(p) => <Input {...p} />}</Field>)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('con error: muestra el mensaje, lo expone como alerta y marca el input', () => {
    render(
      <Field label="PIN" error="El PIN son 4 dígitos.">
        {(p) => <Input {...p} />}
      </Field>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('El PIN son 4 dígitos.')
    const input = screen.getByLabelText('PIN')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // El input describe su error vía aria-describedby apuntando al mensaje.
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
  })

  test('el hint queda referenciado por aria-describedby', () => {
    render(
      <Field label="Nombre" hint="Visible para tu grupo">
        {(p) => <Input {...p} />}
      </Field>,
    )
    const hint = screen.getByText('Visible para tu grupo')
    const input = screen.getByLabelText('Nombre')
    expect(input.getAttribute('aria-describedby')).toContain(hint.id)
  })

  test('hideLabel mantiene la etiqueta accesible', () => {
    render(
      <Field label="Buscar" hideLabel>
        {(p) => <Input {...p} />}
      </Field>,
    )
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument()
  })
})
