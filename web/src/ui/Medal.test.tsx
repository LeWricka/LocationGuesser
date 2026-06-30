import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Medal } from './Medal'

describe('Medal', () => {
  test('expone el puesto como etiqueta accesible', () => {
    render(<Medal rank={1} />)
    expect(screen.getByRole('img', { name: 'Primer puesto' })).toBeInTheDocument()
  })

  test('pinta el número del puesto y la clase de rango', () => {
    const { container } = render(<Medal rank={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(container.querySelector('svg')?.getAttribute('class')).toMatch(/rank-3/)
  })
})
