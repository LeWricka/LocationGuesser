import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SkeletonCard } from './SkeletonCard'

describe('SkeletonCard', () => {
  test('renderiza una fila por línea (por defecto 2)', () => {
    const { container } = render(<SkeletonCard />)
    // Cada bloque del skeleton es decorativo (aria-hidden).
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  test('avatar y acción añaden sus bloques', () => {
    const { container } = render(<SkeletonCard lines={1} avatar action />)
    // 1 línea + avatar + acción = 3 bloques.
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
  })

  test('al menos una línea aunque se pida 0', () => {
    const { container } = render(<SkeletonCard lines={0} />)
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
  })
})
