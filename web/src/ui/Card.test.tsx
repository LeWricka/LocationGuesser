import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  test('renderiza los hijos', () => {
    render(<Card>contenido</Card>)
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  test('aplica el padding por defecto (md)', () => {
    const { container } = render(<Card>x</Card>)
    expect((container.firstElementChild as HTMLElement).className).toMatch(/pad-md/)
  })

  test('padding y raised aplican sus clases', () => {
    const { container } = render(
      <Card padding="lg" raised>
        x
      </Card>,
    )
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toMatch(/pad-lg/)
    expect(cls).toMatch(/raised/)
  })

  test('as permite renderizar otra etiqueta y reenvía props nativas', () => {
    render(
      <Card as="section" aria-label="Reto">
        x
      </Card>,
    )
    expect(screen.getByRole('region', { name: 'Reto' }).tagName).toBe('SECTION')
  })
})
