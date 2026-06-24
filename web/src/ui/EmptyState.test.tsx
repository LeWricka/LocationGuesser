import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  test('muestra título y descripción', () => {
    render(<EmptyState title="Sin retos todavía" description="Crea el primero." />)
    expect(screen.getByText('Sin retos todavía')).toBeInTheDocument()
    expect(screen.getByText('Crea el primero.')).toBeInTheDocument()
  })

  test('el icono es decorativo (aria-hidden)', () => {
    const { container } = render(<EmptyState icon="🗺️" title="Vacío" />)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('🗺️')
  })

  test('la acción solo aparece con label + handler, y dispara onAction', async () => {
    const onAction = vi.fn()
    render(<EmptyState title="Vacío" actionLabel="Crear" onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  test('sin handler no renderiza botón aunque haya label', () => {
    render(<EmptyState title="Vacío" actionLabel="Crear" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
