import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  test('mark expone una etiqueta accesible en el SVG', () => {
    render(<Logo variant="mark" title="Lugares" />)
    expect(screen.getByRole('img', { name: 'Lugares' })).toBeInTheDocument()
  })

  test('wordmark muestra la palabra y una sola etiqueta accesible', () => {
    render(<Logo variant="wordmark" />)
    expect(screen.getByText('Lugares')).toBeInTheDocument()
    // El símbolo es decorativo cuando acompaña a la palabra: una única img.
    expect(screen.getAllByRole('img', { name: 'Lugares' })).toHaveLength(1)
  })

  test('tone="accent" aplica la clase de acento', () => {
    const { container } = render(<Logo variant="mark" tone="accent" />)
    expect(container.firstElementChild?.className).toMatch(/accent/)
  })
})
