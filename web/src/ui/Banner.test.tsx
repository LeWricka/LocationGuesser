import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Banner } from './Banner'

describe('Banner', () => {
  test('renderiza su contenido', () => {
    render(<Banner>Te toca jugar</Banner>)
    expect(screen.getByText('Te toca jugar')).toBeInTheDocument()
  })

  test('el tono aviso usa role=alert; el resto role=status', () => {
    const { rerender } = render(<Banner tone="aviso">Sin conexión</Banner>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Banner tone="info">Te toca jugar</Banner>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('pinta la acción cuando se pasa', () => {
    render(<Banner action={<button>Jugar</button>}>Te toca jugar</Banner>)
    expect(screen.getByRole('button', { name: 'Jugar' })).toBeInTheDocument()
  })
})
