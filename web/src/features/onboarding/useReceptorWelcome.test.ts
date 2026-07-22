import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// `created_by` del grupo, configurable por test: decide si el usuario es el dueño.
let createdBy: string | null = 'owner-1'
// Premios del grupo (issue #752), configurable por test.
let groupPrizes: Record<string, string> | null = null
let coverImagePath: string | null = null
let avatarsById: Map<string, { userId: string; name: string; avatarUrl: string | null }[]> =
  new Map()
let challenges: { is_challenge: boolean; deadline_at: string | null }[] = []

// Espías (no solo stubs): el viaje de EJEMPLO (id centinela, onboarding nuevo
// pieza 4/4) debe cortar ANTES de llamar a NINGUNA de estas — ver el test
// dedicado más abajo, que comprueba `not.toHaveBeenCalled()` en las cuatro.
const maybeSingleSpy = vi.fn(async () => ({ data: { created_by: createdBy } }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => maybeSingleSpy() }),
      }),
    }),
  },
}))

const getGroupSpy = vi.fn(async () => ({
  id: 'g1',
  name: 'Japón 2026',
  prizes: groupPrizes,
  cover_image_path: coverImagePath,
}))
const getGroupChallengesSpy = vi.fn(async () => challenges)
vi.mock('../../lib/groupData', () => ({
  getGroup: () => getGroupSpy(),
  getGroupChallenges: () => getGroupChallengesSpy(),
  isLive: (c: { deadline_at: string | null }, now: Date) =>
    c.deadline_at != null && new Date(c.deadline_at).getTime() > now.getTime(),
}))

const groupAvatarsSpy = vi.fn(async () => avatarsById)
vi.mock('../../lib/membership', () => ({
  groupAvatars: () => groupAvatarsSpy(),
}))

vi.mock('../../lib/storage', () => ({
  signedImageUrl: async (path: string) => `https://signed.example/${path}`,
}))

import { useReceptorWelcome } from './useReceptorWelcome'
import { EXAMPLE_TRIP_GROUP_ID } from '../../lib/exampleTrip'

describe('useReceptorWelcome', () => {
  beforeEach(() => {
    createdBy = 'owner-1'
    groupPrizes = null
    coverImagePath = null
    avatarsById = new Map()
    challenges = []
    maybeSingleSpy.mockClear()
    getGroupSpy.mockClear()
    getGroupChallengesSpy.mockClear()
    groupAvatarsSpy.mockClear()
  })

  // Viaje de EJEMPLO (onboarding nuevo, pieza 4/4): id CENTINELA — solo lectura
  // en memoria, sin fila real en `groups`. Debe cortar ANTES de `isOwner`
  // (maybeSingle) y de `resolveGuestData` (getGroup/getGroupChallenges/
  // groupAvatars): ni una petición, en ninguna visita.
  test('viaje de EJEMPLO (id centinela): nunca pega a Supabase, nunca muestra el marco', async () => {
    const { result } = renderHook(() => useReceptorWelcome(EXAMPLE_TRIP_GROUP_ID, 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(false))
    expect(maybeSingleSpy).not.toHaveBeenCalled()
    expect(getGroupSpy).not.toHaveBeenCalled()
    expect(getGroupChallengesSpy).not.toHaveBeenCalled()
    expect(groupAvatarsSpy).not.toHaveBeenCalled()
  })

  test('no muestra sin grupo o sin usuario', async () => {
    const { result } = renderHook(() => useReceptorWelcome(undefined, undefined))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('al dueño del viaje NO le saluda', async () => {
    createdBy = 'me'
    const { result } = renderHook(() => useReceptorWelcome('g1', 'me'))
    await waitFor(() => expect(result.current.show).toBe(false))
  })

  test('a un receptor (no dueño) le muestra el marco con el nombre del viaje', async () => {
    createdBy = 'owner-1'
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.tripName).toBe('Japón 2026')
  })

  test('issue #752: resume los premios del viaje para el saludo del receptor', async () => {
    createdBy = 'owner-1'
    groupPrizes = { first: 'manda', last: 'invita' }
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.prizesSummary).toBe('1º manda  ·  Último invita')
  })

  test('sin premios definidos, prizesSummary queda undefined', async () => {
    createdBy = 'owner-1'
    groupPrizes = null
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.prizesSummary).toBeUndefined()
  })

  test('resuelve el nombre del dueño y cuenta a los demás ya dentro (sin contar al propio receptor)', async () => {
    createdBy = 'owner-1'
    avatarsById = new Map([
      [
        'g1',
        [
          { userId: 'owner-1', name: 'Lucía', avatarUrl: null },
          { userId: 'member-3', name: 'Ana', avatarUrl: 'emoji:🦊' },
          { userId: 'guest-2', name: 'Yo', avatarUrl: null },
        ],
      ],
    ])
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.ownerName).toBe('Lucía')
    expect(result.current.othersCount).toBe(1)
    // La fila de avatares incluye a todos salvo el propio receptor (dueño incluido).
    expect(result.current.avatarMembers.map((m) => m.userId)).toEqual(['owner-1', 'member-3'])
  })

  test('firma la portada del viaje si el dueño puso una', async () => {
    createdBy = 'owner-1'
    coverImagePath = 'covers/g1.webp'
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.coverImageUrl).toBe('https://signed.example/covers/g1.webp')
  })

  test('sin portada, coverImageUrl queda null', async () => {
    createdBy = 'owner-1'
    coverImagePath = null
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.coverImageUrl).toBeNull()
  })

  test('detecta un reto EN JUEGO ahora mismo', async () => {
    createdBy = 'owner-1'
    challenges = [{ is_challenge: true, deadline_at: new Date(Date.now() + 60_000).toISOString() }]
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.hasActiveChallenge).toBe(true)
  })

  test('sin retos en juego, hasActiveChallenge es false', async () => {
    createdBy = 'owner-1'
    challenges = [{ is_challenge: true, deadline_at: new Date(Date.now() - 60_000).toISOString() }]
    const { result } = renderHook(() => useReceptorWelcome('g1', 'guest-2'))
    await waitFor(() => expect(result.current.show).toBe(true))
    expect(result.current.hasActiveChallenge).toBe(false)
  })
})
