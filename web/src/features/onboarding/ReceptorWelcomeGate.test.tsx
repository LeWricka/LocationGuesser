import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Los dos hooks async (red/Supabase) se stubbean: este fichero prueba el
// ENGANCHE (qué se pinta y cuándo), no la resolución de datos —ya cubierta en
// useReceptorWelcome.test.ts / useGuestRegisterPrompt.test.ts.
let welcomeState: {
  show: boolean
  tripName?: string
  ownerName?: string
  othersCount: number
  avatarMembers: { userId: string; name: string; avatarUrl: string | null }[]
  coverImageUrl: string | null
  hasActiveChallenge: boolean
}
let registerShow = false
const markRegisterSeen = vi.fn()

vi.mock('./useReceptorWelcome', () => ({
  useReceptorWelcome: () => welcomeState,
}))
vi.mock('./useGuestRegisterPrompt', () => ({
  useGuestRegisterPrompt: () => ({ show: registerShow, markSeen: markRegisterSeen }),
}))
vi.mock('../../lib/profile', () => ({
  persistOnboardingSeen: vi.fn(async () => {}),
}))
// Stub del alta real (AccountUpgradeModal): esta suite prueba el ENGANCHE
// (se abre/cierra en el momento correcto), no su flujo interno de email/código
// (ya cubierto en AccountUpgradeModal.test.tsx).
vi.mock('../auth', () => ({
  AccountUpgradeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-modal" /> : null,
}))

import { ReceptorWelcomeGate } from './ReceptorWelcomeGate'

describe('ReceptorWelcomeGate', () => {
  beforeEach(() => {
    localStorage.clear()
    markRegisterSeen.mockClear()
    welcomeState = {
      show: false,
      othersCount: 0,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    registerShow = false
  })

  test('sin marco que mostrar, pinta solo el contenido', () => {
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    expect(screen.getByText('el viaje')).toBeInTheDocument()
    expect(screen.queryByText(/Estás dentro/)).not.toBeInTheDocument()
  })

  test('primera visita del receptor: pinta el marco de UNA pantalla con los datos reales del viaje', () => {
    welcomeState = {
      show: true,
      tripName: 'Ruta por Portugal',
      ownerName: 'Lucía',
      othersCount: 3,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    expect(screen.getByText('el viaje')).toBeInTheDocument()
    expect(screen.getByText('Te han invitado · Ruta por Portugal')).toBeInTheDocument()
    expect(screen.getByText('Estás dentro del viaje de Lucía')).toBeInTheDocument()
  })

  // El registro post-valor es un momento INDEPENDIENTE del marco de arriba: en
  // la primera visita (welcome aún por ver) nunca debe colarse, aunque por lo
  // que sea el hook de registro dijera que sí (defensa además de la propia
  // condición "hasPlayed" de useGuestRegisterPrompt).
  test('el registro NUNCA aparece en la primera visita (antes del valor)', () => {
    welcomeState = {
      show: true,
      tripName: 'Ruta por Portugal',
      ownerName: 'Lucía',
      othersCount: 0,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    registerShow = true // defensivo: aunque el hook lo diera, el gate no lo pinta aquí
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    expect(screen.queryByText('Sigue el viaje desde tu cuenta')).not.toBeInTheDocument()
  })

  test('tras jugar (visita posterior, welcome ya visto), el registro post-valor SÍ aparece', () => {
    welcomeState = {
      show: false,
      othersCount: 0,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    registerShow = true
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    expect(screen.getByText('el viaje')).toBeInTheDocument()
    expect(screen.getByText('Sigue el viaje desde tu cuenta')).toBeInTheDocument()
  })

  test('"Crear cuenta" marca visto el registro y abre el alta real', () => {
    welcomeState = {
      show: false,
      othersCount: 0,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    registerShow = true
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(markRegisterSeen).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument()
  })

  test('"Ahora no" marca visto el registro sin abrir el alta', () => {
    welcomeState = {
      show: false,
      othersCount: 0,
      avatarMembers: [],
      coverImageUrl: null,
      hasActiveChallenge: false,
    }
    registerShow = true
    render(
      <ReceptorWelcomeGate groupId="g1" userId="guest-2" isAnonymous>
        <div>el viaje</div>
      </ReceptorWelcomeGate>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(markRegisterSeen).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument()
  })
})
