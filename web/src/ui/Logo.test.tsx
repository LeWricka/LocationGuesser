import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  test('por defecto pinta el wordmark "Lugares"', () => {
    render(<Logo />)
    expect(screen.getByText('Lugares')).toBeInTheDocument()
  })

  test('variante mark no pinta el texto, solo el símbolo', () => {
    render(<Logo variant="mark" title="Lugares" />)
    expect(screen.queryByText('Lugares')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Lugares' })).toBeInTheDocument()
  })

  test('el tamaño se aplica como font-size en px (escala todo en em)', () => {
    const { container } = render(<Logo size={40} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.fontSize).toBe('40px')
  })

  test('title personaliza la etiqueta accesible del símbolo', () => {
    render(<Logo variant="mark" title="Inicio" />)
    expect(screen.getByRole('img', { name: 'Inicio' })).toBeInTheDocument()
  })
})
