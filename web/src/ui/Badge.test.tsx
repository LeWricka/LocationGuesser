import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  test('renderiza su contenido', () => {
    render(<Badge>cerrado</Badge>)
    expect(screen.getByText('cerrado')).toBeInTheDocument()
  })

  test('aplica la clase del tono', () => {
    render(<Badge tone="live">en vivo</Badge>)
    expect(screen.getByText('en vivo').className).toMatch(/live/)
  })

  test('dot añade un punto decorativo oculto a lectores de pantalla', () => {
    const { container } = render(<Badge dot>en vivo</Badge>)
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).toBeInTheDocument()
  })

  test('sin dot no pinta el punto', () => {
    const { container } = render(<Badge>neutro</Badge>)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })
})
