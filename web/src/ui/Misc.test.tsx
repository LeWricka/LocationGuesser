import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BackHomeButton } from './BackHomeButton'
import { CreateGroupFab } from './CreateGroupFab'
import { HomeEmptyState } from './HomeEmptyState'

describe('BackHomeButton', () => {
  test('muestra "Inicio" por defecto y dispara onClick', async () => {
    const onClick = vi.fn()
    render(<BackHomeButton onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Inicio/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('CreateGroupFab', () => {
  test('es accesible por su etiqueta y dispara onClick', async () => {
    const onClick = vi.fn()
    render(<CreateGroupFab onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('HomeEmptyState', () => {
  test('saluda, explica el producto y ofrece crear viaje', async () => {
    const onCreateGroup = vi.fn()
    render(<HomeEmptyState name="Lewis" onCreateGroup={onCreateGroup} />)
    expect(screen.getByText('Hola, Lewis')).toBeInTheDocument()
    // El hero explica el bucle en 3 pasos.
    expect(screen.getByText('Cómo funciona')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear viaje' }))
    expect(onCreateGroup).toHaveBeenCalledOnce()
  })

  test('"Unirme con un código" eliminado (#495): solo la nota de enlace', () => {
    render(<HomeEmptyState name="Lewis" />)
    // El botón de código fue eliminado: los viajes van por enlace.
    expect(screen.queryByRole('button', { name: /Unirme con un código/i })).not.toBeInTheDocument()
    // La nota de ayuda para quien ya tiene un enlace sí aparece.
    expect(screen.getByText(/Te han pasado un enlace/i)).toBeInTheDocument()
  })
})
