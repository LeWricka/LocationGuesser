import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogoTabide } from './LogoTabide'

describe('LogoTabide', () => {
  test('por defecto pinta el símbolo accesible como "Tabide"', () => {
    render(<LogoTabide />)
    expect(screen.getByRole('img', { name: 'Tabide' })).toBeInTheDocument()
  })

  test('variante claro pinta el pin en grafito', () => {
    render(<LogoTabide variant="claro" />)
    const svg = screen.getByRole('img', { name: 'Tabide' })
    const pin = svg.querySelector('path')
    expect(pin).toHaveAttribute('fill', '#1F2A30')
  })

  test('variante oscuro pinta el pin en papel', () => {
    render(<LogoTabide variant="oscuro" />)
    const svg = screen.getByRole('img', { name: 'Tabide' })
    const pin = svg.querySelector('path')
    expect(pin).toHaveAttribute('fill', '#FBFBF9')
  })

  test('variante mono hereda currentColor en todas las piezas', () => {
    render(<LogoTabide variant="mono" />)
    const svg = screen.getByRole('img', { name: 'Tabide' })
    const pin = svg.querySelector('path')
    const dest = svg.querySelector('circle')
    expect(pin).toHaveAttribute('fill', 'currentColor')
    expect(dest).toHaveAttribute('fill', 'currentColor')
  })

  test('title personaliza la etiqueta accesible', () => {
    render(<LogoTabide title="Inicio" />)
    expect(screen.getByRole('img', { name: 'Inicio' })).toBeInTheDocument()
  })

  test('size se aplica como ancho/alto del svg', () => {
    render(<LogoTabide size={48} />)
    const svg = screen.getByRole('img', { name: 'Tabide' })
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
  })
})
