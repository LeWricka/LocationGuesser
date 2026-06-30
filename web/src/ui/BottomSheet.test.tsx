import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  test('no renderiza nada cuando está cerrada', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('renderiza el contenido y el título cuando está abierta', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Ajustes">
        contenido
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  test('cierra con Escape', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  test('el asa cierra al pulsar', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar hoja' }))
    expect(onClose).toHaveBeenCalled()
  })
})
