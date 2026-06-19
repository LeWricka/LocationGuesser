import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stack } from './Stack'

describe('Stack', () => {
  test('renderiza los hijos en un div por defecto', () => {
    render(
      <Stack>
        <span>uno</span>
        <span>dos</span>
      </Stack>,
    )
    expect(screen.getByText('uno')).toBeInTheDocument()
    expect(screen.getByText('dos').parentElement?.tagName).toBe('DIV')
  })

  test('as permite cambiar la etiqueta (p. ej. main)', () => {
    render(
      <Stack as="main">
        <span>x</span>
      </Stack>,
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  test('gap se traduce a la variable --stack-gap con el token de espaciado', () => {
    const { container } = render(
      <Stack gap={6}>
        <span>x</span>
      </Stack>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--stack-gap')).toBe('var(--space-6)')
  })

  test('align aplica su clase', () => {
    const { container } = render(
      <Stack align="center">
        <span>x</span>
      </Stack>,
    )
    expect((container.firstElementChild as HTMLElement).className).toMatch(/align-center/)
  })
})
