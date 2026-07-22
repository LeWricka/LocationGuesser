import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MemberAvatar, MyGroup, PendingChallenge } from '../../lib/membership'
import type { Profile } from '../../lib/database.types'
import type { ChallengeForPlay } from '../../lib/challenges'

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
// Avatares del grupo (issue #543): por defecto ningún viaje trae miembros
// sembrados en estos tests (no es lo que verifican); un test dedicado a la fila
// de avatares fija esta respuesta explícitamente.
const groupAvatarsMock = vi.fn<(groupIds: string[]) => Promise<Map<string, MemberAvatar[]>>>()
vi.mock('../../lib/membership', () => ({
  myGroups: (userId: string) => myGroupsMock(userId),
  pendingChallenges: (userId: string) => pendingChallengesMock(userId),
  groupAvatars: (groupIds: string[]) => groupAvatarsMock(groupIds),
}))

// Firmado de portadas: la home firma los paths a URL; lo stubbeamos para no tocar
// Storage en el test unitario. Por defecto null (→ la tarjeta cae al fondo de relleno);
// algún test lo sobreescribe para simular una foto firmada con éxito.
const signedImageUrlMock = vi.fn<(path: string) => Promise<string | null>>()
vi.mock('../../lib/storage', () => ({
  signedImageUrl: (path: string) => signedImageUrlMock(path),
}))

// El mapamundi (useWorldTrips) resuelve, por viaje, los momentos situados vía
// getGroupChallenges + getAnswers (lib/groupData / lib/challenges). Mockeamos solo
// esas dos funciones (importOriginal conserva splitByStatus/isLive reales, que son
// puras) para poder simular un viaje con un recuerdo con foto sin tocar Supabase.
const getGroupChallengesMock = vi.fn<(groupId: string) => Promise<ChallengeForPlay[]>>()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return { ...actual, getGroupChallenges: (groupId: string) => getGroupChallengesMock(groupId) }
})

const getAnswersMock =
  vi.fn<(ids: string[]) => Promise<Map<string, { lat: number; lng: number }>>>()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, getAnswers: (ids: string[]) => getAnswersMock(ids) }
})

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
  localStorage.clear()
  sessionState.loading = false
  sessionState.user = { id: 'u1' }
  // Por defecto el tutorial de entrada consta como visto (issue #742): así los
  // tests que no lo verifican no arrastran su overlay. Los tests del tutorial
  // sobreescriben `onboarding` explícitamente.
  sessionState.profile = {
    display_name: 'Lewis',
    avatar_url: null,
    onboarding: { entry: '2026-01-01T00:00:00.000Z' },
  }
  myGroupsMock.mockResolvedValue([])
  pendingChallengesMock.mockResolvedValue([])
  groupAvatarsMock.mockResolvedValue(new Map())
  signedImageUrlMock.mockResolvedValue(null)
  getGroupChallengesMock.mockResolvedValue([])
  getAnswersMock.mockResolvedValue(new Map())
})

describe('HomePage', () => {
  test('muestra skeleton mientras carga la sesión', () => {
    sessionState.loading = true
    render(<HomePage />)
    expect(screen.getByRole('status', { name: 'Cargando tu inicio' })).toBeInTheDocument()
  })

  test('usuario sin grupos → bienvenida con CTA "Crear viaje" y "Ver tutorial" (#742)', async () => {
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear viaje' })).toBeInTheDocument(),
    )
    // El bloque "cómo funciona" se retiró (issue #742): no se repite el tutorial
    // sobre la home vacía; queda a un toque en "Ver tutorial".
    expect(screen.queryByText('Cómo funciona')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver tutorial' })).toBeInTheDocument()
    // CTA de empezar: solo crear (el "Unirme con un código" se elimina en #495).
    expect(screen.queryByRole('button', { name: 'Unirme con un código' })).not.toBeInTheDocument()
    // La nota de enlace sí aparece.
    expect(screen.getByText(/Te han pasado un enlace/i)).toBeInTheDocument()
  })

  test('usuario sin grupos (bienvenida) → un único acceso a perfil, vía avatar (#616)', async () => {
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear viaje' })).toBeInTheDocument(),
    )
    // Antes de #516 la variante de bienvenida no daba ningún acceso a perfil. #616
    // retira el engranaje duplicado (mismo destino que el avatar): solo queda el avatar.
    expect(screen.getByRole('button', { name: 'Abrir tu perfil' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir tus ajustes' })).not.toBeInTheDocument()
  })

  test('sin grupos y tutorial no visto → YA NO se auto-muestra (onboarding nuevo, pieza 3/4)', async () => {
    // Perfil con onboarding vacío = tutorial de entrada aún no visto. Antes
    // (#742) esto auto-mostraba el slideshow sobre la home vacía; ahora quien
    // de verdad crea un viaje aprende HACIENDO dentro del propio viaje (ver
    // useCreadorOnboarding en TripPage) — auto-mostrar aquí ADEMÁS repetiría el
    // mismo bucle dos veces. El slideshow queda solo tras "Ver tutorial".
    sessionState.profile = { display_name: 'Lewis', avatar_url: null, onboarding: {} }
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear viaje' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('"Ver tutorial" reabre el tutorial aunque ya se haya visto (#742)', async () => {
    // beforeEach deja el tutorial como visto → no hay auto-show.
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ver tutorial' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver tutorial' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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

  test('con miembros del grupo → pinta la fila de avatares en la tarjeta (#543)', async () => {
    myGroupsMock.mockResolvedValue([
      {
        id: 'g1',
        name: "Interrail '26",
        role: 'owner',
        isOwner: true,
        status: 'idle',
        createdAt: '2026-06-01T00:00:00Z',
        closed: false,
        startsOn: null,
        endsOn: null,
        coverImagePath: null,
      },
    ])
    groupAvatarsMock.mockResolvedValue(
      new Map([
        [
          'g1',
          [
            { userId: 'u1', name: 'Lewis', avatarUrl: null },
            { userId: 'u2', name: 'Marta', avatarUrl: null },
          ],
        ],
      ]),
    )

    render(<HomePage />)

    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Viaje de 2 personas: Lewis, Marta' }),
      ).toBeInTheDocument(),
    )
  })

  test('viaje en solitario (1 miembro) → no pinta la fila de avatares (#543)', async () => {
    myGroupsMock.mockResolvedValue([
      {
        id: 'g1',
        name: 'Ruta en solitario',
        role: 'owner',
        isOwner: true,
        status: 'idle',
        createdAt: '2026-06-01T00:00:00Z',
        closed: false,
        startsOn: null,
        endsOn: null,
        coverImagePath: null,
      },
    ])
    groupAvatarsMock.mockResolvedValue(
      new Map([['g1', [{ userId: 'u1', name: 'Lewis', avatarUrl: null }]]]),
    )

    render(<HomePage />)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Abrir viaje Ruta en solitario' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  // #554: la tarjeta del viaje cae al placeholder de mapa nocturno aunque el viaje
  // SÍ tenga fotos, porque solo mira su portada explícita (coverImagePath). El pin
  // del globo (useWorldTrips) ya resuelve la foto del recuerdo más reciente para el
  // mismo viaje; la cascada correcta reutiliza esa resolución antes de rendirse al
  // placeholder.
  function memoryChallenge(overrides: Partial<ChallengeForPlay>): ChallengeForPlay {
    return {
      id: 'c1',
      group_id: 'g1',
      title: 'Foto en Bogotá',
      description: null,
      is_challenge: false,
      place_lat: 4.71,
      place_lng: -74.07,
      image_path: 'g1/recuerdo.jpg',
      sv_pano_id: null,
      sv_heading: null,
      sv_pitch: null,
      sv_lock_move: false,
      sv_lock_rotate: false,
      guess_seconds: null,
      deadline_at: null,
      photo_is_hint: false,
      score_scale: 'mundo',
      challenge_kind: 'location',
      number_question: null,
      number_unit: null,
      number_decimals: null,
      number_tolerance: null,
      created_by: 'u1',
      created_at: '2026-06-15T00:00:00Z',
      ...overrides,
    } as unknown as ChallengeForPlay
  }

  test('viaje sin portada propia pero con recuerdo con foto → la tarjeta usa esa foto (#554)', async () => {
    myGroupsMock.mockResolvedValue([
      {
        id: 'g1',
        name: 'Colombia',
        role: 'owner',
        isOwner: true,
        status: 'idle',
        createdAt: '2026-06-01T00:00:00Z',
        closed: false,
        startsOn: null,
        endsOn: null,
        coverImagePath: null, // sin portada explícita: el fallback debe entrar en juego
      },
    ])
    getGroupChallengesMock.mockResolvedValue([memoryChallenge({})])
    signedImageUrlMock.mockImplementation((path) =>
      Promise.resolve(path === 'g1/recuerdo.jpg' ? 'https://signed.test/g1/recuerdo.jpg' : null),
    )

    const { container } = render(<HomePage />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Abrir viaje Colombia' })).toBeInTheDocument(),
    )
    // La cascada cae a la foto del recuerdo (misma URL firmada que usa el pin del
    // globo): la tarjeta ya no pinta el placeholder.
    await waitFor(() => {
      const cover = container.querySelector('span[class*="cover"]') as HTMLElement | null
      expect(cover).not.toBeNull()
      expect(cover?.style.backgroundImage).toContain('https://signed.test/g1/recuerdo.jpg')
    })
    expect(container.querySelectorAll('span[class*="placeholder"]')).toHaveLength(0)
  })

  test('viaje sin portada ni recuerdos con foto → la tarjeta cae al placeholder', async () => {
    myGroupsMock.mockResolvedValue([
      {
        id: 'g1',
        name: 'Perú',
        role: 'owner',
        isOwner: true,
        status: 'idle',
        createdAt: '2026-06-01T00:00:00Z',
        closed: false,
        startsOn: null,
        endsOn: null,
        coverImagePath: null,
      },
    ])
    // Recuerdo situado pero SIN foto: no hay nada de qué tirar en la cascada.
    getGroupChallengesMock.mockResolvedValue([memoryChallenge({ image_path: null })])

    const { container } = render(<HomePage />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Abrir viaje Perú' })).toBeInTheDocument(),
    )
    expect(container.querySelectorAll('span[class*="placeholder"]')).toHaveLength(1)
    expect(container.querySelectorAll('span[class*="cover"]')).toHaveLength(0)
  })

  test('error de carga → aviso, sin romper', async () => {
    myGroupsMock.mockRejectedValue(new Error('boom'))
    render(<HomePage />)
    await waitFor(() =>
      expect(screen.getByText(/No hemos podido cargar tu inicio/)).toBeInTheDocument(),
    )
  })
})
