import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoStrip } from './PhotoStrip'

describe('PhotoStrip', () => {
  test('vacío muestra el mensaje guía', () => {
    render(<PhotoStrip photos={[]} />)
    expect(screen.getByText('Aún no hay fotos en este grupo.')).toBeInTheDocument()
  })

  test('renderiza una miniatura por foto', () => {
    render(
      <PhotoStrip
        photos={[
          { id: '1', src: '/a.jpg', alt: 'Lisboa' },
          { id: '2', src: '/b.jpg', alt: 'París' },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Lisboa' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'París' })).toBeInTheDocument()
  })

  test('onSelect recibe el id de la foto pulsada', async () => {
    const onSelect = vi.fn()
    render(<PhotoStrip photos={[{ id: 'x', src: '/a.jpg', alt: 'Lisboa' }]} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lisboa' }))
    expect(onSelect).toHaveBeenCalledWith('x')
  })
})
