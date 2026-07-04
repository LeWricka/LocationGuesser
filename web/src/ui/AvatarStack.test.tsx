import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarStack } from './AvatarStack'

describe('AvatarStack', () => {
  test('con 0 o 1 miembro no pinta nada (viaje en solitario)', () => {
    const { container: sinMiembros } = render(<AvatarStack members={[]} />)
    expect(sinMiembros).toBeEmptyDOMElement()

    const { container: unMiembro } = render(
      <AvatarStack members={[{ userId: 'u1', name: 'Ana' }]} />,
    )
    expect(unMiembro).toBeEmptyDOMElement()
  })

  test('con 2+ miembros pinta un grupo con aria-label listando los nombres', () => {
    render(
      <AvatarStack
        members={[
          { userId: 'u1', name: 'Ana' },
          { userId: 'u2', name: 'Beto' },
        ]}
      />,
    )
    expect(
      screen.getByRole('group', { name: 'Viaje de 2 personas: Ana, Beto' }),
    ).toBeInTheDocument()
  })

  test('recorta a `max` avatares (3 por defecto) y suma el resto en un chip "+N"', () => {
    const members = [
      { userId: 'u1', name: 'Ana' },
      { userId: 'u2', name: 'Beto' },
      { userId: 'u3', name: 'Cris' },
      { userId: 'u4', name: 'Dani' },
      { userId: 'u5', name: 'Eva' },
    ]
    const { container } = render(<AvatarStack members={members} />)
    expect(container.querySelectorAll('span[class*="item"]')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  test('sin overflow no pinta el chip "+N"', () => {
    const members = [
      { userId: 'u1', name: 'Ana' },
      { userId: 'u2', name: 'Beto' },
    ]
    const { container } = render(<AvatarStack members={members} />)
    expect(container.querySelectorAll('span[class*="item"]')).toHaveLength(2)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  test('respeta un `max` distinto', () => {
    const members = [
      { userId: 'u1', name: 'Ana' },
      { userId: 'u2', name: 'Beto' },
      { userId: 'u3', name: 'Cris' },
    ]
    const { container } = render(<AvatarStack members={members} max={2} />)
    expect(container.querySelectorAll('span[class*="item"]')).toHaveLength(2)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })
})
