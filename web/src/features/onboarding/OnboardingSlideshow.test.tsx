import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingSlideshow } from './OnboardingSlideshow'
import { getSlides } from './slides'

describe('OnboardingSlideshow — render de pasos (#625)', () => {
  test('renderiza el primer paso con su titular, cuerpo y un punto por slide', () => {
    const slides = getSlides('group')
    render(<OnboardingSlideshow slides={slides} onSkip={vi.fn()} onComplete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: slides[0].title })).toBeInTheDocument()
    expect(screen.getByText(slides[0].body)).toBeInTheDocument()
    expect(screen.getByText(`Momentu · 1 de ${slides.length}`)).toBeInTheDocument()
    // El "Saltar" está siempre visible desde el primer frame (issue #625).
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeInTheDocument()
  })

  test('máximo 3 pasos en el tutorial del viaje (los 3 gestos clave)', () => {
    expect(getSlides('group')).toHaveLength(3)
  })

  test('"Siguiente" avanza de paso y el último botón dice "A viajar"', () => {
    const slides = getSlides('group')
    render(<OnboardingSlideshow slides={slides} onSkip={vi.fn()} onComplete={vi.fn()} />)

    for (let i = 0; i < slides.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(screen.getByRole('heading', { name: slides[i + 1].title })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'A viajar' })).toBeInTheDocument()
  })

  test('"A viajar" en el último paso completa el tutorial', () => {
    const slides = getSlides('group')
    const onComplete = vi.fn()
    render(<OnboardingSlideshow slides={slides} onSkip={vi.fn()} onComplete={onComplete} />)

    for (let i = 0; i < slides.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'A viajar' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  test('"Saltar" llama a onSkip sin importar el paso', () => {
    const slides = getSlides('challenge')
    const onSkip = vi.fn()
    render(<OnboardingSlideshow slides={slides} onSkip={onSkip} onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  test('la bienvenida del receptor adapta el primer paso al viaje', () => {
    const slides = getSlides('welcome', { tripName: 'Japón 2026' })
    render(<OnboardingSlideshow slides={slides} onSkip={vi.fn()} onComplete={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /Japón 2026/ })).toBeInTheDocument()
  })
})
