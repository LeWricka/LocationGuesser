import { describe, test, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  test('sin avatar_url pinta el animal por defecto del id como SVG (sin emoji suelto)', () => {
    render(<Avatar userId="user-1" name="Lewis" />)
    const node = screen.getByRole('img', { name: 'Lewis' })
    expect(node.querySelector('svg')).toBeInTheDocument()
    // El avatar por defecto nunca muestra texto de emoji: es siempre dibujo.
    expect(node.textContent).toBe('')
  })

  test('token del set pinta el dibujo de línea (SVG)', () => {
    // El zorro (🦊) es uno de los 8 animales con avatar SVG: se pinta a trazo,
    // sin texto del emoji. Comprobamos que hay un <svg> dentro del avatar.
    render(<Avatar userId="user-1" avatarUrl="emoji:🦊" name="Ana" />)
    const node = screen.getByRole('img', { name: 'Ana' })
    expect(node.querySelector('svg')).toBeInTheDocument()
  })

  test('token antiguo (fuera del set) también pinta SVG, nunca emoji suelto', () => {
    // El panda (🐼) ya no está en el set de 8: se proyecta de forma estable a
    // uno de los 8 y se pinta como dibujo, sin texto de emoji.
    render(<Avatar userId="user-1" avatarUrl="emoji:🐼" name="Ana" />)
    const node = screen.getByRole('img', { name: 'Ana' })
    expect(node.querySelector('svg')).toBeInTheDocument()
    expect(node.textContent).toBe('')
  })

  test('URL http renderiza una imagen con alt = nombre (retrocompat)', () => {
    render(<Avatar userId="user-1" avatarUrl="https://a.test/p.png" name="Ana" />)
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'https://a.test/p.png')
  })

  test('si la foto falla al cargar cae al animal por defecto del id (SVG)', () => {
    render(<Avatar userId="user-1" avatarUrl="https://a.test/p.png" name="Ana" />)
    const img = screen.getByRole('img', { name: 'Ana' })
    fireEvent.error(img)
    // Ya no hay <img>; se pinta el dibujo SVG por defecto del id.
    const node = screen.getByRole('img', { name: 'Ana' })
    expect(node.querySelector('svg')).toBeInTheDocument()
  })

  test('sin nombre usa un aria-label genérico', () => {
    render(<Avatar userId="user-1" />)
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
  })
})
