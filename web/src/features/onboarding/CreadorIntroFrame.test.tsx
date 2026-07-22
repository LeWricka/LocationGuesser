import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreadorIntroFrame } from './CreadorIntroFrame'

describe('CreadorIntroFrame', () => {
  test('pinta el copy exacto de la intro del creador', () => {
    render(<CreadorIntroFrame onStart={vi.fn()} />)
    expect(screen.getByText('Momentu')).toBeInTheDocument()
    expect(screen.getByText('Tu viaje, compartido con tu gente.')).toBeInTheDocument()
    expect(screen.getByText(/Un diario para tus viajes: guardas cada momento/)).toBeInTheDocument()
  })

  test('"Empezar" llama a onStart', () => {
    const onStart = vi.fn()
    render(<CreadorIntroFrame onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Empezar/ }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
