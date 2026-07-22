import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MomentChallengeSuggestion } from './MomentChallengeSuggestion'

describe('MomentChallengeSuggestion', () => {
  test('pinta el copy exacto de la sugerencia', () => {
    render(
      <MomentChallengeSuggestion photoUrl={null} onCreateChallenge={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('¿Y si les lanzas un reto de este momento?')).toBeInTheDocument()
    expect(
      screen.getByText('Tu gente adivina dónde es. Gana quien más se acerca.'),
    ).toBeInTheDocument()
  })

  test('"Crear un reto" llama a onCreateChallenge', () => {
    const onCreateChallenge = vi.fn()
    render(
      <MomentChallengeSuggestion
        photoUrl={null}
        onCreateChallenge={onCreateChallenge}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear un reto' }))
    expect(onCreateChallenge).toHaveBeenCalledTimes(1)
  })

  test('× llama a onDismiss sin crear el reto', () => {
    const onCreateChallenge = vi.fn()
    const onDismiss = vi.fn()
    render(
      <MomentChallengeSuggestion
        photoUrl={null}
        onCreateChallenge={onCreateChallenge}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sugerencia' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCreateChallenge).not.toHaveBeenCalled()
  })

  test('con foto del momento, la pinta de miniatura', () => {
    const { container } = render(
      <MomentChallengeSuggestion
        photoUrl="https://example.com/foto.jpg"
        onCreateChallenge={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.src).toBe('https://example.com/foto.jpg')
  })
})
