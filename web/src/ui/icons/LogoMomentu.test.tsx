import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogoMomentu } from './LogoMomentu'

describe('LogoMomentu', () => {
  test('por defecto pinta el símbolo accesible como "Momentu"', () => {
    render(<LogoMomentu />)
    expect(screen.getByRole('img', { name: 'Momentu' })).toBeInTheDocument()
  })

  test('por defecto (variant "color") pinta el gradiente de marca oro→teal', () => {
    render(<LogoMomentu />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    // El núcleo teal y la estela de luz se pintan con gradientes propios (no
    // `currentColor`): confirma que no cayó al modo mono por defecto.
    expect(svg.querySelector('radialGradient')).toBeInTheDocument()
    expect(svg.querySelector('linearGradient')).toBeInTheDocument()
  })

  test('variante mono hereda currentColor en todas las piezas', () => {
    render(<LogoMomentu variant="mono" />)
    const svg = screen.getByRole('img', { name: 'Momentu' })
    const group = svg.querySelector('g')
    expect(group).toHaveAttribute('fill', 'currentColor')
    expect(group).toHaveAttribute('stroke', 'currentColor')
    expect(svg.querySelector('radialGradient')).not.toBeInTheDocument()
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
