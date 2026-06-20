import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { MyGroup, PendingChallenge } from '../../lib/membership'
import type { Challenge, Profile } from '../../lib/database.types'

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

vi.mock('../../lib/leaderboard', () => ({
  getGroupVotes: vi.fn(async () => []),
}))

// supabase: builder mínimo para la consulta de autores (profiles .in()) y un
// canal de realtime que no hace nada (la home solo se suscribe).
const profilesData: { data: unknown; error: unknown } = { data: [], error: null }
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.in = () => Promise.resolve(profilesData)
      return builder
    },
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

const challenge = (over: Partial<Challenge> = {}): Challenge =>
  ({
    id: 'c1',
    group_id: 'g1',
    title: 'Reto',
    lat: 0,
    lng: 0,
    image_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    guess_seconds: null,
    deadline_at: '2999-01-01T00:00:00.000Z',
    photo_is_hint: false,
    created_by: 'author1',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Challenge

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.loading = false
  sessionState.user = { id: 'u1' }
  sessionState.profile = { display_name: 'Lewis', avatar_url: null }
  profilesData.data = []
  myGroupsMock.mockResolvedValue([])
  pendingChallengesMock.mockResolvedValue([])
})

describe('HomePage', () => {
  test('muestra skeleton mientras carga la sesión', () => {
    sessionState.loading = true
    render(<HomePage />)
    expect(screen.getByRole('status', { name: 'Cargando tu inicio' })).toBeInTheDocument()
  })

  test('usuario sin grupos → estado de bienvenida', async () => {
    render(<HomePage />)
    await waitFor(() => expect(screen.getByText('¡Bienvenido, Lewis!')).toBeInTheDocument())
  })

  test('mapea grupos y turnos, resolviendo el autor por su perfil', async () => {
    myGroupsMock.mockResolvedValue([
      { id: 'g1', name: "Interrail '26", role: 'owner', isOwner: true, status: 'your-turn' },
    ])
    pendingChallengesMock.mockResolvedValue([
      { challenge: challenge(), groupId: 'g1', groupName: "Interrail '26" },
    ])
    profilesData.data = [{ id: 'author1', display_name: 'Ana' }]

    render(<HomePage />)

    // Turno con autor resuelto (el nombre del grupo aparece en turno y tarjeta;
    // anclamos en "reto de Ana", que es único del turno).
    await waitFor(() => expect(screen.getByText(/reto de Ana/)).toBeInTheDocument())
    // Grupo con chip de dueño.
    expect(screen.getByText('Tuyo')).toBeInTheDocument()
  })

  test('error de carga → aviso, sin romper', async () => {
    myGroupsMock.mockRejectedValue(new Error('boom'))
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByText(/No hemos podido cargar tu inicio/)).toBeInTheDocument(),
    )
  })
})
