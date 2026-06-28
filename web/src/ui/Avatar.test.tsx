import { describe, test, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

  test('si la foto falla al cargar cae al animal por defecto del id', () => {
    render(<Avatar userId="user-1" avatarUrl="https://a.test/p.png" name="Ana" />)
    const img = screen.getByRole('img', { name: 'Ana' })
    fireEvent.error(img)
    // Ya no hay <img>; se pinta el emoji por defecto del id.
    const node = screen.getByRole('img', { name: 'Ana' })
    expect(node).toHaveTextContent(defaultAvatarFor('user-1').emoji)
  })

  test('sin nombre usa un aria-label genérico', () => {
    render(<Avatar userId="user-1" />)
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
  })
})
