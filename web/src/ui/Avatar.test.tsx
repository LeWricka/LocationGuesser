import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  test('sin src muestra la inicial del nombre', () => {
    render(<Avatar name="lewis" />)
    expect(screen.getByText('L')).toBeInTheDocument()
  })

  test('con src renderiza una imagen con alt = nombre', () => {
    render(<Avatar name="Ana" src="/a.png" />)
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', '/a.png')
  })

  test('nombre vacío cae a "?"', () => {
    render(<Avatar name="   " />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
