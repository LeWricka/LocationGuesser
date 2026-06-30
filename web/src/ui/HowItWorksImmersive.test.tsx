import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HowItWorksImmersive } from './HowItWorksImmersive'

describe('HowItWorksImmersive', () => {
  test('renderiza los 3 pasos del bucle', () => {
    render(<HowItWorksImmersive />)
    expect(screen.getByRole('heading', { name: 'Comparte un momento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lo viven y adivinan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Queda en el viaje' })).toBeInTheDocument()
  })

  test('cierra el bucle con el marcador del ganador', () => {
    render(<HowItWorksImmersive />)
    expect(screen.getByText('Lucía')).toBeInTheDocument()
    expect(screen.getByText('4,2 km')).toBeInTheDocument()
  })

  test('remata con el pie de marca', () => {
    render(<HowItWorksImmersive />)
    expect(
      screen.getByText('Adivinar es solo el gancho. Compartir es lo que somos.'),
    ).toBeInTheDocument()
  })

  test('el CTA solo aparece con handler y lo dispara', async () => {
    const onCta = vi.fn()
    render(<HowItWorksImmersive ctaLabel="Empieza un viaje" onCta={onCta} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empieza un viaje' }))
    expect(onCta).toHaveBeenCalledOnce()
  })

  test('sin handler no renderiza el botón', () => {
    render(<HowItWorksImmersive />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('el escenario del mapa es decorativo (aria-hidden)', () => {
    const { container } = render(<HowItWorksImmersive />)
    // El stage del satélite no aporta texto; va oculto a lectores de pantalla.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
