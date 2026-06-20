import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileStep } from './ProfileStep'

describe('ProfileStep', () => {
  test('pregunta por el nombre con el que juega', () => {
    render(<ProfileStep displayName="" onDisplayNameChange={() => {}} />)
    expect(screen.getByRole('heading', { name: '¿Con qué nombre juegas?' })).toBeInTheDocument()
  })

  test('escribir el nombre llama a onDisplayNameChange', async () => {
    const onChange = vi.fn()
    render(<ProfileStep displayName="" onDisplayNameChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'L')
    expect(onChange).toHaveBeenCalledWith('L')
  })

  test('enviar dispara onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<ProfileStep displayName="Lewis" onDisplayNameChange={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar a jugar' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
