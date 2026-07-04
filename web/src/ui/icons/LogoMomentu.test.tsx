import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogoMomentu } from './LogoMomentu'

describe('LogoMomentu', () => {
  test('por defecto pinta el símbolo accesible como "Momentu"', () => {
    render(<LogoMomentu />)
    expect(screen.getByRole('img', { name: 'Momentu' })).toBeInTheDocument()
  })

  test('variante claro pinta el pin en grafito', () => {
    render(<LogoMomentu variant="claro" />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    const pin = svg.querySelector('path')
    expect(pin).toHaveAttribute('fill', '#1F2A30')
  })

  test('variante oscuro pinta el pin en papel', () => {
    render(<LogoMomentu variant="oscuro" />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    const pin = svg.querySelector('path')
    expect(pin).toHaveAttribute('fill', '#FBFBF9')
  })

  test('variante mono hereda currentColor en todas las piezas', () => {
    render(<LogoMomentu variant="mono" />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    const pin = svg.querySelector('path')
    const dest = svg.querySelector('circle')
    expect(pin).toHaveAttribute('fill', 'currentColor')
    expect(dest).toHaveAttribute('fill', 'currentColor')
  })

  test('title personaliza la etiqueta accesible', () => {
    render(<LogoMomentu title="Inicio" />)
    expect(screen.getByRole('img', { name: 'Inicio' })).toBeInTheDocument()
  })

  test('size se aplica como ancho/alto del svg', () => {
    render(<LogoMomentu size={48} />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
  })
})
