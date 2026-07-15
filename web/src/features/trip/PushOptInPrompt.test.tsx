import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

// El gate de disponibilidad (issue #769) se mockea por completo: el render
// condicional puro ya está cubierto por lib/pushPrompt.test.ts (shouldShowPushPrompt);
// aquí solo comprobamos que el COMPONENTE respeta ese gate y dispara las acciones
// correctas (analítica + subscribeToPush), sin tocar APIs reales del navegador.
const usePushAvailabilityMock = vi.fn()
vi.mock('../auth', () => ({
  usePushAvailability: () => usePushAvailabilityMock(),
}))

const subscribeToPushMock = vi.fn()
vi.mock('../../lib/push', () => ({
  subscribeToPush: (...args: unknown[]) => subscribeToPushMock(...args),
}))

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import { PushOptInPrompt } from './PushOptInPrompt'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { snoozePushPrompt } from '../../lib/pushPrompt'

const PROMPT_TEXT = '¿Te avisamos cuando haya un reto nuevo?'

function fakeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session: null,
    user: { id: 'u1' } as User,
    profile: null,
    loading: false,
    verified: true,
    isAnonymous: false,
    refreshProfile: async () => {},
    ...overrides,
  }
}

// El gate "ideal": exactamente lo que haría que shouldShowPushPrompt (real, no
// mockeado aquí) dijera que sí — ver lib/pushPrompt.test.ts para sus reglas.
function idealGate() {
  return {
    capable: true,
    configured: true,
    supported: true,
    permission: 'default' as const,
    subscribed: false,
    loading: false,
  }
}

function renderPrompt(sessionOverrides: Partial<SessionState> = {}) {
  return render(
    <SessionContext.Provider value={fakeSession(sessionOverrides)}>
      <PushOptInPrompt surface="trip_banner" groupId="g1" />
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  usePushAvailabilityMock.mockReset().mockReturnValue(idealGate())
  subscribeToPushMock.mockReset()
  trackMock.mockReset()
})

describe('PushOptInPrompt — render condicional', () => {
  test('no renderiza nada sin usuario en sesión', () => {
    renderPrompt({ user: null })
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('no renderiza nada si ya hay una suscripción activa', () => {
    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), subscribed: true })
    renderPrompt()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('no renderiza nada con el permiso ya concedido o denegado', () => {
    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), permission: 'granted' })
    const { rerender } = renderPrompt()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()

    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), permission: 'denied' })
    rerender(
      <SessionContext.Provider value={fakeSession()}>
        <PushOptInPrompt surface="trip_banner" groupId="g1" />
      </SessionContext.Provider>,
    )
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('no renderiza nada mientras el gate resuelve el estado inicial', () => {
    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), loading: true })
    renderPrompt()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('no renderiza nada sin capacidad del navegador ni sin config VAPID', () => {
    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), capable: false })
    const { rerender } = renderPrompt()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()

    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), configured: false })
    rerender(
      <SessionContext.Provider value={fakeSession()}>
        <PushOptInPrompt surface="trip_banner" groupId="g1" />
      </SessionContext.Provider>,
    )
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('no renderiza nada si el pre-prompt está en snooze', () => {
    snoozePushPrompt()
    renderPrompt()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('renderiza el banner con el gate ideal y emite push_prompt_shown', () => {
    renderPrompt()
    expect(screen.getByText(PROMPT_TEXT)).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('push_prompt_shown', {
      surface: 'trip_banner',
      group_id: 'g1',
    })
  })
})

describe('PushOptInPrompt — acciones', () => {
  test('"Sí, avisadme" suscribe y emite accepted con outcome granted', async () => {
    subscribeToPushMock.mockResolvedValue('subscribed')
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Sí, avisadme' }))

    expect(subscribeToPushMock).toHaveBeenCalledWith('u1')
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('push_prompt_accepted', {
        surface: 'trip_banner',
        group_id: 'g1',
        outcome: 'granted',
      }),
    )
    // Tras decidir (concedido, denegado o cerrado sin decidir) no reaparece en
    // esta vista: evita el "flash" de volver a verlo tras responder.
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
  })

  test('"Sí, avisadme" con denegación emite accepted con outcome denied', async () => {
    subscribeToPushMock.mockResolvedValue('denied')
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Sí, avisadme' }))

    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('push_prompt_accepted', {
        surface: 'trip_banner',
        group_id: 'g1',
        outcome: 'denied',
      }),
    )
  })

  test('cerrar el prompt nativo sin decidir emite accepted con outcome default', async () => {
    subscribeToPushMock.mockResolvedValue('default')
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Sí, avisadme' }))

    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('push_prompt_accepted', {
        surface: 'trip_banner',
        group_id: 'g1',
        outcome: 'default',
      }),
    )
  })

  test('la X descarta, snoozea (localStorage) y emite dismissed', async () => {
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Ahora no' }))

    expect(trackMock).toHaveBeenCalledWith('push_prompt_dismissed', {
      surface: 'trip_banner',
      group_id: 'g1',
    })
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
    expect(localStorage.getItem('lg.pushPrompt.snoozeUntil')).not.toBeNull()
  })
})
