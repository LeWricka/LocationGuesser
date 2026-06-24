import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileButton } from './FileButton'

describe('FileButton', () => {
  test('renderiza su contenido y un input de archivo accesible', () => {
    render(
      <FileButton ariaLabel="Añadir foto" onPick={() => {}}>
        📷 Añadir foto
      </FileButton>,
    )
    expect(screen.getByText('📷 Añadir foto')).toBeInTheDocument()
    const input = screen.getByLabelText('Añadir foto') as HTMLInputElement
    expect(input).toHaveAttribute('type', 'file')
  })

  test('devuelve el fichero elegido en onPick', async () => {
    const onPick = vi.fn()
    const user = userEvent.setup()
    render(
      <FileButton ariaLabel="Añadir foto" accept="image/*" onPick={onPick}>
        Subir
      </FileButton>,
    )
    const input = screen.getByLabelText('Añadir foto') as HTMLInputElement
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    await user.upload(input, file)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toBeInstanceOf(File)
    expect(onPick.mock.calls[0][0].name).toBe('foto.jpg')
  })

  test('loading muestra estado ocupado y deshabilita el input', () => {
    render(
      <FileButton ariaLabel="Añadir foto" loading onPick={() => {}}>
        Subiendo
      </FileButton>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByLabelText('Añadir foto')).toBeDisabled()
  })

  test('disabled bloquea el input', () => {
    render(
      <FileButton ariaLabel="Añadir foto" disabled onPick={() => {}}>
        No
      </FileButton>,
    )
    expect(screen.getByLabelText('Añadir foto')).toBeDisabled()
  })

  test('aplica las clases de variante y tamaño del Button', () => {
    render(
      <FileButton ariaLabel="Foto" variant="primary" size="lg" onPick={() => {}}>
        X
      </FileButton>,
    )
    const label = screen.getByText('X').closest('label')
    expect(label?.className).toMatch(/primary/)
    expect(label?.className).toMatch(/lg/)
  })
})
