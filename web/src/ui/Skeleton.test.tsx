import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  test('es decorativo: aria-hidden para que el lector de pantalla lo ignore', () => {
    const { container } = render(<Skeleton />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })

  test('aplica alto y ancho numéricos como píxeles', () => {
    const { container } = render(<Skeleton width={120} height={40} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('40px')
  })

  test('admite alto/ancho como cadena CSS sin convertir', () => {
    const { container } = render(<Skeleton width="50%" height="46svh" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('50%')
    expect(el.style.height).toBe('46svh')
  })
})
