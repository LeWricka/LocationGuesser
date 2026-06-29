import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { MyGroup } from '../../lib/membership'
import type { Profile } from '../../lib/database.types'

// --- Mocks de los contratos que consume la home -----------------------------

const sessionState = {
  session: {} as unknown,
  user: { id: 'u1' } as { id: string } | null,
  profile: { display_name: 'Lewis', avatar_url: null } as Partial<Profile> | null,
  loading: false,
  refreshProfile: vi.fn(),
}
vi.mock('../../lib/session-context', () => ({
  useSession: () => sessionState,
}))

const myGroupsMock = vi.fn<(userId: string) => Promise<MyGroup[]>>()
vi.mock('../../lib/membership', () => ({
  myGroups: (userId: string) => myGroupsMock(userId),
}))

// El mapamundi depende de la capa de mapa (MapLibre/Leaflet): lo stubbeamos para
// aislar la home de la infra de mapa en el test unitario.
vi.mock('./useWorldTrips', () => ({
  useWorldTrips: () => ({ trips: [], totalKm: 0, loading: false }),
}))
vi.mock('./HomeWorldMap', () => ({
  HomeWorldMap: () => <div data-testid="world-map" />,
}))

// supabase: solo un canal de realtime que no hace nada (la home se suscribe).
vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => {
      const ch: Record<string, unknown> = {}
      ch.on = () => ch
      ch.subscribe = () => ch
      return ch
    },
    removeChannel: vi.fn(),
  },
}))

import { HomePage } from './HomePage'

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.loading = false
  sessionState.user = { id: 'u1' }
  sessionState.profile = { display_name: 'Lewis', avatar_url: null }
  myGroupsMock.mockResolvedValue([])
})

describe('HomePage', () => {
  test('muestra skeleton mientras carga la sesión', () => {
    sessionState.loading = true
    render(<HomePage />)
    expect(screen.getByRole('status', { name: 'Cargando tu inicio' })).toBeInTheDocument()
  })

  test('usuario sin grupos → hero explicativo con "cómo funciona"', async () => {
    render(<HomePage />)
    await waitFor(() => expect(screen.getByText('Cómo funciona')).toBeInTheDocument())
    // CTAs de empezar: crear o unirse con código.
    expect(screen.getByRole('button', { name: 'Crear grupo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unirme con un código' })).toBeInTheDocument()
  })

  test('con grupos → dashboard de recuerdos con el viaje y el mapamundi', async () => {
    myGroupsMock.mockResolvedValue([
      { id: 'g1', name: "Interrail '26", role: 'owner', isOwner: true, status: 'your-turn' },
    ])

    render(<HomePage />)

    // El viaje aparece como tarjeta (su botón abre el viaje) y el mapamundi se monta.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument(),
    )
    expect(screen.getByTestId('world-map')).toBeInTheDocument()
    // SIN "cómo funciona" para el usuario recurrente (relato nuevo).
    expect(screen.queryByText('Cómo funciona')).not.toBeInTheDocument()
  })

  test('error de carga → aviso, sin romper', async () => {
    myGroupsMock.mockRejectedValue(new Error('boom'))
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByText(/No hemos podido cargar tu inicio/)).toBeInTheDocument(),
    )
  })
})
