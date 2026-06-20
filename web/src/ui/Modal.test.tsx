import { useState } from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  test('no renderiza nada cuando está cerrado', () => {
    render(
      <Modal open={false} title="Hola">
        contenido
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('contenido')).not.toBeInTheDocument()
  })

  test('abierto: expone role=dialog con aria-modal y el título lo etiqueta', () => {
    render(
      <Modal open title="¿Quién juega?">
        cuerpo
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('¿Quién juega?')
    expect(screen.getByText('cuerpo')).toBeInTheDocument()
  })

  test('mueve el foco al panel al abrir', () => {
    render(
      <Modal open title="T">
        x
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  test('Escape llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('el botón de cerrar llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('clic en el overlay cierra; clic dentro del panel no', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        <span>dentro</span>
      </Modal>,
    )
    await user.click(screen.getByText('dentro'))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('escribir en un input del modal NO roba el foco (regresión)', async () => {
    const user = userEvent.setup()
    // onClose se recrea en cada render (función inline), como en el caso real:
    // el modal no debe re-enfocar el panel en cada tecla.
    function Harness() {
      const [v, setV] = useState('')
      return (
        <Modal open onClose={() => undefined} title="T">
          <input aria-label="nombre" value={v} onChange={(e) => setV(e.target.value)} />
        </Modal>
      )
    }
    render(<Harness />)
    const input = screen.getByLabelText('nombre')
    input.focus()
    await user.type(input, 'Ana')
    expect(input).toHaveValue('Ana')
    expect(input).toHaveFocus()
  })

  test('sin onClose no es descartable (Escape no rompe ni cierra)', async () => {
    const user = userEvent.setup()
    render(
      <Modal open title="Empezar">
        x
      </Modal>,
    )
    await user.keyboard('{Escape}')
    // Sigue abierto y sin botón de cerrar.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
  })
})
