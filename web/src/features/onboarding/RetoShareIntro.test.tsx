import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareIntro } from './RetoShareIntro'

describe('RetoShareIntro', () => {
  test('pinta el copy exacto de la intro mínima', () => {
    render(<RetoShareIntro photoUrl={null} onPlay={vi.fn()} />)
    expect(screen.getByText('Te han retado')).toBeInTheDocument()
    expect(screen.getByText('¿Adivinas dónde es esta foto?')).toBeInTheDocument()
    expect(
      screen.getByText(/Marca en el mapa antes de que se acabe el tiempo\./),
    ).toBeInTheDocument()
    expect(screen.getByText('Gana quien más se acerca.')).toBeInTheDocument()
  })

  test('"Jugar" llama a onPlay', () => {
    const onPlay = vi.fn()
    render(<RetoShareIntro photoUrl={null} onPlay={onPlay} />)
    fireEvent.click(screen.getByRole('button', { name: /Jugar/ }))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  test('con foto del reto, la pinta de fondo', () => {
    const { container } = render(
      <RetoShareIntro photoUrl="https://example.com/foto.jpg" onPlay={vi.fn()} />,
    )
    const img = container.querySelector('img')
    expect(img?.src).toBe('https://example.com/foto.jpg')
  })
})
