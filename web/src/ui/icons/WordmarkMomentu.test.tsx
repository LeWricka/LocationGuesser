import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { WordmarkMomentu } from './WordmarkMomentu'
import styles from './WordmarkMomentu.module.css'

describe('WordmarkMomentu', () => {
  test('expone el texto accesible "momentu" para lectores de pantalla', () => {
    // El texto "momentu" aparece dos veces (sr-only + construcción visual duplicada
    // a a11y, ver test siguiente): apuntamos al nodo sr-only por clase, no por texto.
    const { container } = render(<WordmarkMomentu />)
    const srOnly = container.querySelector(`.${styles.srOnly}`)
    expect(srOnly).toHaveTextContent('momentu')
  })

  test('la construcción visual (texto + mini-pin de cierre) está oculta a a11y', () => {
    const { container } = render(<WordmarkMomentu />)
    const visual = container.querySelector('[aria-hidden="true"]')
    expect(visual).not.toBeNull()
    expect(visual?.textContent).toContain('momentu')
  })

  test('el mini-pin de cierre es un svg teal', () => {
    const { container } = render(<WordmarkMomentu />)
    const dot = container.querySelector('svg path')
    expect(dot).toHaveAttribute('fill', '#0F766E')
  })

  test('size se aplica como font-size en px', () => {
    const { container } = render(<WordmarkMomentu size={32} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.fontSize).toBe('32px')
  })
})
