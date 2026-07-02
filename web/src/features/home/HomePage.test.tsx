import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { MyGroup, PendingChallenge } from '../../lib/membership'
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
const pendingChallengesMock = vi.fn<(userId: string) => Promise<PendingChallenge[]>>()
vi.mock('../../lib/membership', () => ({
  myGroups: (userId: string) => myGroupsMock(userId),
  pendingChallenges: (userId: string) => pendingChallengesMock(userId),
}))

// Firmado de portadas: la home firma los paths a URL; lo stubbeamos para no tocar
// Storage en el test unitario (devuelve null → la tarjeta cae al fondo de relleno).
vi.mock('../../lib/storage', () => ({
  signedImageUrl: vi.fn().mockResolvedValue(null),
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
  pendingChallengesMock.mockResolvedValue([])
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
    // CTA de empezar: solo crear (el "Unirme con un código" se elimina en #495).
    expect(screen.getByRole('button', { name: 'Crear viaje' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unirme con un código' })).not.toBeInTheDocument()
    // La nota de enlace sí aparece.
    expect(screen.getByText(/Te han pasado un enlace/i)).toBeInTheDocument()
  })

  test('usuario sin grupos (bienvenida) → SÍ hay acceso a perfil/ajustes (#516)', async () => {
    render(<HomePage />)
    await waitFor(() => expect(screen.getByText('Cómo funciona')).toBeInTheDocument())
    // Antes de #516 la variante de bienvenida no daba ningún acceso a perfil: mismo
    // patrón de botones (ajustes + avatar) que la home con viajes (HomeDashboard).
    expect(screen.getByRole('button', { name: 'Abrir tus ajustes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir tu perfil' })).toBeInTheDocument()
  })

  test('con grupos → feed de portadas con el viaje, sin montar mapamundi', async () => {
    myGroupsMock.mockResolvedValue([
      {
        id: 'g1',
        name: "Interrail '26",
        role: 'owner',
        isOwner: true,
        status: 'your-turn',
        createdAt: '2026-06-01T00:00:00Z',
        closed: false,
        startsOn: null,
        endsOn: null,
        coverImagePath: null,
      },
    ])

    render(<HomePage />)

    // El viaje aparece como tarjeta-portada (su botón abre el viaje).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument(),
    )
    // La home B NO monta el mapamundi (no hay capa de mapa de héroe).
    expect(screen.queryByTestId('world-map')).not.toBeInTheDocument()
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
