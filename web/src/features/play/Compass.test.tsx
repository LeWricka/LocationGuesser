import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Compass } from './Compass'

describe('Compass', () => {
  test('muestra el punto cardinal del heading (0 = Norte)', () => {
    render(<Compass heading={0} />)
    expect(screen.getByText('N')).toBeInTheDocument()
  })

  test('redondea al sector cardinal más cercano (45 = NE, 90 = E)', () => {
    const { rerender } = render(<Compass heading={45} />)
    expect(screen.getByText('NE')).toBeInTheDocument()
    rerender(<Compass heading={90} />)
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  test('normaliza headings negativos y >360', () => {
    const { rerender } = render(<Compass heading={-90} />)
    // -90 → 270 → Oeste
    expect(screen.getByText('O')).toBeInTheDocument()
    rerender(<Compass heading={360} />)
    expect(screen.getByText('N')).toBeInTheDocument()
  })

  test('rota la aguja según el heading', () => {
    const { container } = render(<Compass heading={120} />)
    const rotor = container.querySelector('g')
    expect(rotor?.getAttribute('style')).toMatch(/rotate\(120deg\)/)
  })

  test('expone una etiqueta accesible con la dirección', () => {
    render(<Compass heading={180} />)
    expect(screen.getByRole('img', { name: /Mirando hacia S/ })).toBeInTheDocument()
  })
})
