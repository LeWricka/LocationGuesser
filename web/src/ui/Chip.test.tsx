import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip } from './Chip'

describe('Chip', () => {
  test('renderiza su contenido', () => {
    render(<Chip>12 recuerdos</Chip>)
    expect(screen.getByText('12 recuerdos')).toBeInTheDocument()
  })

  test('aplica la clase del tono', () => {
    render(<Chip tone="gold">Reto</Chip>)
    expect(screen.getByText('Reto').className).toMatch(/gold/)
  })
})
