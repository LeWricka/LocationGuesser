import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WordmarkTabide } from './WordmarkTabide'

describe('WordmarkTabide', () => {
  test('expone el texto accesible "tabide" para lectores de pantalla', () => {
    render(<WordmarkTabide />)
    expect(screen.getByText('tabide')).toBeInTheDocument()
  })

  test('la construcción visual (glifo sin punto + mini-pin) está oculta a a11y', () => {
    const { container } = render(<WordmarkTabide />)
    const visual = container.querySelector('[aria-hidden="true"]')
    expect(visual).not.toBeNull()
    expect(visual?.textContent).toContain('tab')
  })

  test('el mini-pin de la "i" es un svg teal', () => {
    const { container } = render(<WordmarkTabide />)
    const dot = container.querySelector('svg path')
    expect(dot).toHaveAttribute('fill', '#0F766E')
  })

  test('size se aplica como font-size en px', () => {
    const { container } = render(<WordmarkTabide size={32} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.fontSize).toBe('32px')
  })
})
