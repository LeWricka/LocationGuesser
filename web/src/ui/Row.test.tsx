import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Row } from './Row'

describe('Row', () => {
  test('renderiza los hijos en un div por defecto', () => {
    render(
      <Row>
        <span>a</span>
        <span>b</span>
      </Row>,
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b').parentElement?.tagName).toBe('DIV')
  })

  test('as cambia la etiqueta', () => {
    render(
      <Row as="nav">
        <span>x</span>
      </Row>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  test('gap se traduce a la variable --row-gap', () => {
    const { container } = render(
      <Row gap={5}>
        <span>x</span>
      </Row>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--row-gap')).toBe('var(--space-5)')
  })

  test('justify, align y wrap aplican sus clases', () => {
    const { container } = render(
      <Row justify="between" align="end" wrap>
        <span>x</span>
      </Row>,
    )
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toMatch(/justify-between/)
    expect(cls).toMatch(/align-end/)
    expect(cls).toMatch(/wrap/)
  })
})
