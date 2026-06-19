import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  test('expone role=status con etiqueta por defecto', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando')
  })

  test('admite una etiqueta personalizada', () => {
    render(<Spinner label="Subiendo foto" />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Subiendo foto')
  })

  test('size fija la variable CSS de tamaño', () => {
    render(<Spinner size={32} />)
    expect(screen.getByRole('status').style.getPropertyValue('--spinner-size')).toBe('32px')
  })

  test('color fija la variable CSS de color', () => {
    render(<Spinner color="red" />)
    expect(screen.getByRole('status').style.getPropertyValue('--spinner-color')).toBe('red')
  })
})
