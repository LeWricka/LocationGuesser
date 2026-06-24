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

  test('tocar fuera (el fondo) llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox open src="/f.jpg" onClose={onClose} />)
    // El fondo es el padre del dialog (el overlay con position:fixed).
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('un clic dentro del panel NO cierra', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Lightbox open src="/f.jpg" alt="Foto" onClose={onClose} />)
    // Click sobre la imagen (dentro del panel): no debe cerrar.
    await user.click(screen.getByRole('img', { name: 'Foto' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('con una sola imagen no hay flechas de navegación', () => {
    render(<Lightbox open src="/f.jpg" onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Foto anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument()
  })

  test('con varias imágenes: flechas que navegan (cíclico) y contador', async () => {
    const user = userEvent.setup()
    const images = [
      { src: '/a.jpg', alt: 'A' },
      { src: '/b.jpg', alt: 'B' },
    ]
    render(<Lightbox open images={images} onClose={() => undefined} />)
    // Empieza en la primera.
    expect(screen.getByRole('img')).toHaveAttribute('src', '/a.jpg')
    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/b.jpg')
    // Avanzar otra vez vuelve a la primera (cíclico).
    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/a.jpg')
    // Retroceder desde la primera va a la última (cíclico).
    await user.click(screen.getByRole('button', { name: 'Foto anterior' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', '/b.jpg')
  })

  test('flechas del teclado navegan con varias imágenes', async () => {
    const user = userEvent.setup()
    const images = [
      { src: '/a.jpg', alt: 'A' },
      { src: '/b.jpg', alt: 'B' },
    ]
    render(<Lightbox open images={images} onClose={() => undefined} />)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/b.jpg')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/a.jpg')
  })

  test('startIndex posiciona en la imagen indicada', () => {
    const images = [
      { src: '/a.jpg', alt: 'A' },
      { src: '/b.jpg', alt: 'B' },
      { src: '/c.jpg', alt: 'C' },
    ]
    render(<Lightbox open images={images} startIndex={2} onClose={() => undefined} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/c.jpg')
  })
})
