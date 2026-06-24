import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'
import { defaultAvatarFor } from '../lib/avatar'

describe('Avatar', () => {
  test('sin avatar_url muestra el animal por defecto del id', () => {
    render(<Avatar userId="user-1" name="Lewis" />)
    const node = screen.getByRole('img', { name: 'Lewis' })
    expect(node).toHaveTextContent(defaultAvatarFor('user-1').emoji)
  })

  test('token emoji muestra ese animal', () => {
    render(<Avatar userId="user-1" avatarUrl="emoji:🦊" name="Ana" />)
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveTextContent('🦊')
  })

  test('URL http renderiza una imagen con alt = nombre (retrocompat)', () => {
    render(<Avatar userId="user-1" avatarUrl="https://a.test/p.png" name="Ana" />)
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'https://a.test/p.png')
  })

  test('sin nombre usa un aria-label genérico', () => {
    render(<Avatar userId="user-1" />)
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
  })
})
