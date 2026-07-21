import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuestRegisterPrompt } from './GuestRegisterPrompt'

describe('GuestRegisterPrompt', () => {
  test('pinta el copy exacto de registro post-valor', () => {
    render(<GuestRegisterPrompt onCreateAccount={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Guárdalo')).toBeInTheDocument()
    expect(screen.getByText('Sigue el viaje desde tu cuenta')).toBeInTheDocument()
    expect(screen.getByText('Crea una cuenta para vivir toda la experiencia.')).toBeInTheDocument()
  })

  test('"Crear cuenta" llama a onCreateAccount', () => {
    const onCreateAccount = vi.fn()
    render(<GuestRegisterPrompt onCreateAccount={onCreateAccount} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })

  test('"Ahora no" llama a onDismiss', () => {
    const onDismiss = vi.fn()
    render(<GuestRegisterPrompt onCreateAccount={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
