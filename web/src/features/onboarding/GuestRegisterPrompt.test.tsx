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

  // Reuso por el registro de la entrada por reto compartido (onboarding nuevo,
  // pieza 2/4, RetoShareExplainSequence): mismo eyebrow/cuerpo/CTAs, titular propio.
  test('con `title`, sustituye el titular por defecto (mismo eyebrow y cuerpo)', () => {
    render(
      <GuestRegisterPrompt
        title="No pierdas tus retos"
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('No pierdas tus retos')).toBeInTheDocument()
    expect(screen.getByText('Guárdalo')).toBeInTheDocument()
    expect(screen.getByText('Crea una cuenta para vivir toda la experiencia.')).toBeInTheDocument()
    expect(screen.queryByText('Sigue el viaje desde tu cuenta')).not.toBeInTheDocument()
  })
})
