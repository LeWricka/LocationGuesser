import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupCard } from './GroupCard'

describe('GroupCard', () => {
  test('muestra el nombre del grupo', () => {
    render(<GroupCard name="Interrail '26" status="idle" />)
    expect(screen.getByText("Interrail '26")).toBeInTheDocument()
  })

  test('muestra la etiqueta del estado segun el status', () => {
    const { rerender } = render(<GroupCard name="G" status="live" />)
    expect(screen.getByText('En vivo')).toBeInTheDocument()
    rerender(<GroupCard name="G" status="toplay" />)
    expect(screen.getByText('Te toca')).toBeInTheDocument()
    rerender(<GroupCard name="G" status="idle" />)
    expect(screen.getByText('Al día')).toBeInTheDocument()
  })

  test('muestra el chip "Tuyo" solo si owned', () => {
    const { rerender } = render(<GroupCard name="G" status="idle" />)
    expect(screen.queryByText('Tuyo')).not.toBeInTheDocument()
    rerender(<GroupCard name="G" status="idle" owned />)
    expect(screen.getByText('Tuyo')).toBeInTheDocument()
  })

  test('es un boton accesible y llama a onClick cuando se le pasa', async () => {
    const onClick = vi.fn()
    render(<GroupCard name="Lisboa" status="idle" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Abrir viaje Lisboa' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('sin onClick no renderiza un boton', () => {
    render(<GroupCard name="G" status="idle" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
