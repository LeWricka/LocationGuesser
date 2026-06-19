import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  test('renderiza su contenido como botón', () => {
    render(<Button>Entrar</Button>)
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  test('type por defecto es "button" (no envía formularios)', () => {
    render(<Button>Acción</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  test('llama onClick al pulsar', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Pulsa</Button>)
    await user.click(screen.getByRole('button', { name: 'Pulsa' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('disabled bloquea el botón y no dispara onClick', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button disabled onClick={onClick}>
        No
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'No' })
    expect(btn).toBeDisabled()
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  test('loading muestra estado ocupado, deshabilita y bloquea onClick', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button loading onClick={onClick}>
        Guardando
      </Button>,
    )
    const btn = screen.getByRole('button', { name: /Guardando/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    // El spinner (role=status) acompaña al estado de carga.
    expect(screen.getByRole('status')).toBeInTheDocument()
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  test('aplica las clases de variante y tamaño', () => {
    const { rerender } = render(
      <Button variant="secondary" size="lg">
        X
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/secondary/)
    expect(btn.className).toMatch(/lg/)
    rerender(
      <Button variant="ghost" size="sm">
        X
      </Button>,
    )
    expect(btn.className).toMatch(/ghost/)
    expect(btn.className).toMatch(/sm/)
  })

  test('fullWidth añade su clase', () => {
    render(<Button fullWidth>Ancho</Button>)
    expect(screen.getByRole('button').className).toMatch(/fullWidth/)
  })
})
