import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Lightbox } from './Lightbox'

describe('Lightbox', () => {
  test('no renderiza nada cuando está cerrado', () => {
    render(<Lightbox open={false} src="/foto.jpg" alt="Calle" onClose={() => undefined} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('abierto: dialog con aria-modal mostrando la imagen', () => {
    render(<Lightbox open src="/foto.jpg" alt="Calle de Lisboa" onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Calle de Lisboa')
    expect(screen.getByRole('img', { name: 'Calle de Lisboa' })).toHaveAttribute('src', '/foto.jpg')
  })

  test('el botón de cerrar llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox open src="/f.jpg" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('Escape llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox open src="/f.jpg" onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('pulsar la imagen alterna el zoom (aria-pressed)', async () => {
    const user = userEvent.setup()
    render(<Lightbox open src="/f.jpg" alt="Foto" onClose={() => undefined} />)
    const zoomBtn = screen.getByRole('button', { name: 'Acercar foto' })
    expect(zoomBtn).toHaveAttribute('aria-pressed', 'false')
    await user.click(zoomBtn)
    expect(screen.getByRole('button', { name: 'Alejar foto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('bloquea el scroll del body mientras está abierto', () => {
    const { unmount } = render(<Lightbox open src="/f.jpg" onClose={() => undefined} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
