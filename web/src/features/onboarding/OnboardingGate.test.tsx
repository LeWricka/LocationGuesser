import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

// El slideshow es presentacional y pesado (foco, tokens); lo stubbeamos: aquí solo
// verificamos la ANALÍTICA del gate, no su render.
vi.mock('./OnboardingSlideshow', () => ({
  OnboardingSlideshow: () => <div data-testid="slideshow" />,
}))

import { OnboardingGate } from './OnboardingGate'

describe('OnboardingGate — analítica de recepción (#330)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    localStorage.clear()
  })

  test('en contexto welcome emite receptor_welcome_shown con group_id', () => {
    render(
      <OnboardingGate context="welcome" userId="guest-2" groupId="g1">
        <div>contenido</div>
      </OnboardingGate>,
    )
    expect(trackMock).toHaveBeenCalledWith('onboarding_started', { context: 'welcome' })
    expect(trackMock).toHaveBeenCalledWith('receptor_welcome_shown', { group_id: 'g1' })
  })

  test('en otros contextos NO emite receptor_welcome_shown', () => {
    render(
      <OnboardingGate context="group" userId="guest-2">
        <div>contenido</div>
      </OnboardingGate>,
    )
    expect(trackMock).toHaveBeenCalledWith('onboarding_started', { context: 'group' })
    expect(trackMock).not.toHaveBeenCalledWith('receptor_welcome_shown', expect.anything())
  })
})

// Arreglo de RAÍZ (issue #717): el perfil de la cuenta gatea el slideshow,
// aunque el localStorage de este navegador esté vacío.
describe('OnboardingGate — perfil como fuente de la verdad (#717)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    localStorage.clear()
  })

  test('perfil visto para este contexto → no muestra el slideshow ni emite onboarding_started', () => {
    const { queryByTestId } = render(
      <OnboardingGate
        context="group"
        userId="u1"
        profileOnboarding={{ group: '2026-07-01T00:00:00.000Z' }}
      >
        <div>contenido</div>
      </OnboardingGate>,
    )
    expect(queryByTestId('slideshow')).toBeNull()
    expect(trackMock).not.toHaveBeenCalled()
  })

  test('perfil limpio ({}) → sí muestra el slideshow', () => {
    const { getByTestId } = render(
      <OnboardingGate context="group" userId="u1" profileOnboarding={{}}>
        <div>contenido</div>
      </OnboardingGate>,
    )
    expect(getByTestId('slideshow')).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('onboarding_started', { context: 'group' })
  })
})
