import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../../lib/database.types'

// Gate de disponibilidad del dispositivo (issue #769): se mockea por completo,
// igual que en PushOptInPrompt.test.tsx — aquí solo comprobamos que el
// COMPONENTE respeta ese gate (toggles deshabilitados sin permiso) y dispara
// las acciones correctas (subscribeToPush/unsubscribeFromPush, setPushPref,
// analítica), sin tocar APIs reales del navegador.
const usePushAvailabilityMock = vi.fn()
vi.mock('./usePushAvailability', () => ({
  usePushAvailability: () => usePushAvailabilityMock(),
}))

const subscribeToPushMock = vi.fn()
const unsubscribeFromPushMock = vi.fn()
vi.mock('../../lib/push', () => ({
  subscribeToPush: (...args: unknown[]) => subscribeToPushMock(...args),
  unsubscribeFromPush: (...args: unknown[]) => unsubscribeFromPushMock(...args),
}))

const setPushPrefMock = vi.fn()
vi.mock('../../lib/pushPrefs', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pushPrefs')>('../../lib/pushPrefs')
  return {
    ...actual,
    setPushPref: (...args: unknown[]) => setPushPrefMock(...args),
  }
})

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import { PushNotificationsControl } from './PushNotificationsControl'
import { ToastProvider } from '../../ui'

// Gate "ideal": permiso concedido + suscripción activa en este dispositivo —
// el único estado en el que los cuatro interruptores deben quedar habilitados.
function idealGate() {
  return {
    capable: true,
    configured: true,
    supported: true,
    permission: 'granted' as const,
    subscribed: true,
    loading: false,
  }
}

function renderControl(profile: Profile | null = null) {
  return render(
    <ToastProvider>
      <PushNotificationsControl userId="u1" profile={profile} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  usePushAvailabilityMock.mockReset().mockReturnValue(idealGate())
  subscribeToPushMock.mockReset()
  unsubscribeFromPushMock.mockReset()
  setPushPrefMock.mockReset().mockResolvedValue({})
  trackMock.mockReset()
})

describe('PushNotificationsControl — sección "Notificaciones"', () => {
  test('siempre muestra los cuatro tipos de aviso', () => {
    renderControl()
    expect(screen.getByRole('switch', { name: 'Reto nuevo' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Momento nuevo' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Fin de reto' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Fin de viaje' })).toBeInTheDocument()
  })

  test('sin push_prefs (columna aún no migrada) todos los tipos aparecen activados', () => {
    renderControl(null)
    for (const name of ['Reto nuevo', 'Momento nuevo', 'Fin de reto', 'Fin de viaje']) {
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true')
    }
  })

  test('respeta un tipo desactivado en el perfil sin afectar a los demás', () => {
    renderControl({ push_prefs: { memory: false } } as Profile)
    expect(screen.getByRole('switch', { name: 'Momento nuevo' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('switch', { name: 'Reto nuevo' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('sin permiso del dispositivo, los cuatro toggles quedan deshabilitados con hint', () => {
    usePushAvailabilityMock.mockReturnValue({
      ...idealGate(),
      permission: 'default',
      subscribed: false,
    })
    renderControl()
    expect(screen.getByRole('switch', { name: 'Reto nuevo' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Fin de viaje' })).toBeDisabled()
    expect(
      screen.getByText('Activa los avisos para elegir qué tipo de avisos quieres recibir.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeInTheDocument()
  })

  test('con permiso concedido, los toggles están habilitados y togglear dispara setPushPref optimista + analítica', async () => {
    const user = userEvent.setup()
    renderControl({ push_prefs: {} } as Profile)
    const toggle = screen.getByRole('switch', { name: 'Momento nuevo' })
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)

    // Optimista: el aria-checked cambia antes/independientemente de esperar la promesa.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(setPushPrefMock).toHaveBeenCalledWith('u1', 'memory', false, {})
    expect(trackMock).toHaveBeenCalledWith('push_pref_changed', { kind: 'memory', enabled: false })
  })

  test('si falla la persistencia, revierte el toggle y muestra un aviso de error', async () => {
    setPushPrefMock.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    renderControl({ push_prefs: {} } as Profile)
    const toggle = screen.getByRole('switch', { name: 'Fin de reto' })

    await user.click(toggle)

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText('No pudimos guardar tu preferencia')).toBeInTheDocument()
  })

  test('"Activar avisos" llama a subscribeToPush', async () => {
    usePushAvailabilityMock.mockReturnValue({
      ...idealGate(),
      permission: 'default',
      subscribed: false,
    })
    subscribeToPushMock.mockResolvedValue('subscribed')
    const user = userEvent.setup()
    renderControl()

    await user.click(screen.getByRole('button', { name: 'Activar avisos' }))
    expect(subscribeToPushMock).toHaveBeenCalledWith('u1')
  })

  test('sin capacidad del navegador, no ofrece activar pero sí muestra las preferencias (deshabilitadas)', () => {
    usePushAvailabilityMock.mockReturnValue({ ...idealGate(), capable: false, supported: false })
    renderControl()
    expect(screen.getByText('Este dispositivo no admite avisos push.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Reto nuevo' })).toBeDisabled()
  })
})
