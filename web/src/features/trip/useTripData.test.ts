import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ChallengeForPlay } from '../../lib/challenges'
import type { GroupInfo } from '../../lib/groupData'
import type { LatLng } from '../../lib/geo'
import type { VoteWithName } from '../../lib/leaderboard'

// Issue #593: `getAnswers` (lib/challenges) es quien decide qué respuestas sirve la
// RLS. Mockeamos solo esa función (importOriginal conserva el resto: `isPractice
// Challenge`, etc.) para fijar exactamente qué mapa lat/lng "llega del servidor" en
// cada test, sin montar Supabase — así podemos simular tanto el caso real (un
// ACTIVO nunca se pide: `refresh` solo llama a `getAnswers` con los CERRADOS) como
// el de un CERRADO de NÚMERO (la propia `getAnswers` filtra sus lat/lng a null, así
// que nunca aporta fila aquí).
const getAnswersMock = vi.fn<(ids: string[]) => Promise<Map<string, LatLng>>>()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, getAnswers: (ids: string[]) => getAnswersMock(ids) }
})

// Issue #578: `useTripData` deriva `isOwn` (created_by === myUserId) para que la
// tarjeta del reto NUNCA ofrezca "Adivina →" sobre un reto propio. Mockeamos solo
// las funciones que pegan a Supabase (importOriginal conserva `isLive`/`splitByStatus`,
// puras, igual patrón que HomePage.test.tsx) para no montar la BD real.
const getGroupMock = vi.fn<(groupId: string) => Promise<GroupInfo | null>>()
const getGroupChallengesMock = vi.fn<(groupId: string) => Promise<ChallengeForPlay[]>>()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return {
    ...actual,
    getGroup: (groupId: string) => getGroupMock(groupId),
    getGroupChallenges: (groupId: string) => getGroupChallengesMock(groupId),
  }
})

function makeVote(overrides: Partial<VoteWithName>): VoteWithName {
  return {
    id: 'v1',
    group_id: 'g1',
    challenge_id: 'c1',
    user_id: 'u-otro',
    display_name: 'Otro',
    avatar: null,
    points: 0,
    distance_km: null,
    guess_lat: null,
    guess_lng: null,
    guess_number: null,
    abs_error: null,
    left_app: false,
    elapsed_seconds: null,
    play_started_at: null,
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

const getGroupVotesMock = vi.fn<(groupId: string) => Promise<VoteWithName[]>>()
vi.mock('../../lib/leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/leaderboard')>()
  return { ...actual, getGroupVotes: (groupId: string) => getGroupVotesMock(groupId) }
})

// La suscripción Realtime no aporta nada al test: un canal inerte, igual patrón
// que HomePage.test.tsx.
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

import { useTripData } from './useTripData'

function activeChallenge(overrides: Partial<ChallengeForPlay>): ChallengeForPlay {
  return {
    id: 'c1',
    group_id: 'g1',
    title: 'Reto activo',
    description: null,
    is_challenge: true,
    place_lat: null,
    place_lng: null,
    image_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    sv_lock_move: false,
    sv_lock_rotate: false,
    guess_seconds: null,
    // Bien en el futuro: el reto sigue EN JUEGO (isLive → true).
    deadline_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    photo_is_hint: true,
    score_scale: 'mundo',
    challenge_kind: 'location',
    number_question: null,
    number_unit: null,
    number_decimals: 0,
    number_tolerance: 'normal',
    created_by: 'u-owner',
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  } as unknown as ChallengeForPlay
}

// Mismo reto que `activeChallenge` pero con plazo YA VENCIDO (cerrado): entra en
// `splitByStatus(...).past`, así que `refresh` SÍ pide su respuesta a `getAnswers`.
function closedChallenge(overrides: Partial<ChallengeForPlay>): ChallengeForPlay {
  return activeChallenge({
    deadline_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getGroupMock.mockResolvedValue({
    id: 'g1',
    name: 'Viaje',
    prizes: null,
    closed_at: null,
    starts_on: null,
    ends_on: null,
    description: null,
    companions: null,
    cover_image_path: null,
  })
  getGroupVotesMock.mockResolvedValue([])
  getAnswersMock.mockResolvedValue(new Map())
})

describe('useTripData — isOwn (issue #578)', () => {
  test('reto creado por mí: isOwn = true', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-me' })])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(true)
  })

  test('reto creado por otro miembro: isOwn = false', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-otro' })])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(false)
  })

  test('sin sesión (myUserId null): nunca es propio', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', created_by: 'u-otro' })])

    const { result } = renderHook(() => useTripData('g1', null))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].isOwn).toBe(false)
  })
})

// Issue #593: hallazgo de seguridad — ¿viaja la respuesta de un reto EN JUEGO al
// cliente? NO: `refresh` solo pide `getAnswers` de los CERRADOS (`splitByStatus(...)
// .past`), así que un ACTIVO nunca tiene entrada en el mapa devuelto y su
// `lat`/`lng` quedan `null` a propósito (comentario "REGLA ANTI-SPOILER" en
// `lib/trip.ts`). Estos tests fijan ese contrato para que un cambio futuro no lo
// rompa en silencio, y cubren el reto de NÚMERO (cifra): su respuesta tampoco es
// una coordenada, así que nunca puede aportar un pin al mapa.
describe('useTripData — visibilidad de pines por estado (issue #593)', () => {
  test('reto EN JUEGO: lat/lng quedan null y no entra en la ruta del mapa', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1' })])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    // `getAnswers` ni siquiera se llama con el id del activo: RLS no lo serviría.
    expect(getAnswersMock).not.toHaveBeenCalledWith(expect.arrayContaining(['c1']))
    expect(result.current.moments[0].status).toBe('active')
    expect(result.current.moments[0].lat).toBeNull()
    expect(result.current.moments[0].lng).toBeNull()
    expect(result.current.route).toHaveLength(0)
  })

  test('reto CERRADO de lugar: su respuesta (ya servida por RLS) entra en la ruta', async () => {
    getGroupChallengesMock.mockResolvedValue([closedChallenge({ id: 'c1' })])
    getAnswersMock.mockResolvedValue(new Map([['c1', { lat: 40.4, lng: -3.7 }]]))

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    expect(result.current.moments[0].status).toBe('closed')
    expect(result.current.moments[0].lat).toBe(40.4)
    expect(result.current.moments[0].lng).toBe(-3.7)
    expect(result.current.route).toHaveLength(1)
    expect(result.current.route[0].challengeId).toBe('c1')
  })

  test('reto CERRADO de NÚMERO (cifra): timeline sí, mapa nunca (no tiene coordenada)', async () => {
    // Un reto de número no tiene lat/lng que revelar: `getAnswers` real ya filtra a
    // null sus filas (challenges.test.ts), así que aquí simulamos ESE resultado
    // (mapa sin entrada para 'c1') en vez de reimplementar el filtro.
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({ id: 'c1', challenge_kind: 'number', number_question: '¿Cuánto costó?' }),
    ])
    getAnswersMock.mockResolvedValue(new Map())

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(1))

    // Timeline/carrusel: el momento SÍ aparece (issue #593, punto 2).
    expect(result.current.moments[0].status).toBe('closed')
    expect(result.current.moments[0].title).toBeTruthy()
    // Mapa: sin coordenada, nunca entra en la ruta.
    expect(result.current.moments[0].lat).toBeNull()
    expect(result.current.moments[0].lng).toBeNull()
    expect(result.current.route).toHaveLength(0)
  })
})

// Issue #608: "Retos anteriores" del Marcador (rescatado de GroupPage/PastSection)
// necesita, por reto CERRADO, quién ganó y cómo me fue A MÍ — derivado de los
// votos reales, sin volver a pedir nada a Supabase.
describe('useTripData — pastChallenges (issue #608)', () => {
  test('gana quien más puntos saca; mi resultado y el aviso anti-trampa se derivan de mi voto', async () => {
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({ id: 'c1', title: 'Bosque de bambú' }),
    ])
    getGroupVotesMock.mockResolvedValue([
      makeVote({ id: 'v1', challenge_id: 'c1', user_id: 'u-me', points: 3100, left_app: false }),
      makeVote({
        id: 'v2',
        challenge_id: 'c1',
        user_id: 'u-otro',
        display_name: 'Marta',
        points: 4880,
        left_app: true,
      }),
    ])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(1))

    const [summary] = result.current.pastChallenges
    expect(summary.title).toBe('Bosque de bambú')
    expect(summary.winner).toEqual({
      name: 'Marta',
      points: 4880,
      distanceKm: null,
      leftApp: true,
    })
    expect(summary.myResult).toEqual({ points: 3100, distanceKm: null, leftApp: false })
    expect(summary.isOwn).toBe(false)
  })

  test('reto cerrado sin votos: winner y myResult null', async () => {
    getGroupChallengesMock.mockResolvedValue([closedChallenge({ id: 'c1' })])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(1))

    expect(result.current.pastChallenges[0].winner).toBeNull()
    expect(result.current.pastChallenges[0].myResult).toBeNull()
  })

  test('reto propio: isOwn = true (nadie vota su propio reto, así que myResult queda null)', async () => {
    getGroupChallengesMock.mockResolvedValue([closedChallenge({ id: 'c1', created_by: 'u-me' })])
    getGroupVotesMock.mockResolvedValue([
      makeVote({ id: 'v1', challenge_id: 'c1', user_id: 'u-otro', points: 4200 }),
    ])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(1))

    expect(result.current.pastChallenges[0].isOwn).toBe(true)
    expect(result.current.pastChallenges[0].myResult).toBeNull()
  })

  test('orden: mismo orden (más reciente primero) que sirve getGroupChallenges', async () => {
    // getGroupChallenges sirve DESC (más nuevo primero, ver comentario de
    // `moments`); pastChallenges invierte `moments` (ASC) de vuelta a DESC, así
    // que el resultado neto conserva el orden cronológico real (sin happened_on,
    // `created_at` decide — momentos legado). Timestamps DISTINTOS a propósito:
    // dos filas con el MISMO created_at sería un caso patológico que no se da en
    // la práctica (ver test de desempate más abajo para el caso SÍ real: mismo
    // happened_on, distinto created_at).
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({ id: 'c-nuevo', title: 'Nuevo', created_at: '2026-07-02T10:00:00.000Z' }),
      closedChallenge({ id: 'c-viejo', title: 'Viejo', created_at: '2026-07-01T10:00:00.000Z' }),
    ])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(2))

    expect(result.current.pastChallenges.map((c) => c.title)).toEqual(['Nuevo', 'Viejo'])
  })
})

// Issue #800: "Retos anteriores" pasa a incluir los retos EN JUEGO (no solo los
// cerrados) para que el detalle nuevo (`ChallengeDetail`) sea alcanzable desde
// ahí también — sin ganador (el resultado no es definitivo) y ordenados los EN
// JUEGO primero (el que cierra antes, primero).
describe('useTripData — pastChallenges incluye los EN JUEGO (issue #800)', () => {
  test('un reto EN JUEGO entra con status "active" y sin ganador, aunque ya tenga votos', async () => {
    getGroupChallengesMock.mockResolvedValue([activeChallenge({ id: 'c1', title: 'Torre Eiffel' })])
    getGroupVotesMock.mockResolvedValue([
      makeVote({ id: 'v1', challenge_id: 'c1', user_id: 'u-me', points: 3100 }),
    ])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(1))

    const [summary] = result.current.pastChallenges
    expect(summary.status).toBe('active')
    // El resultado no es definitivo EN JUEGO: nunca se promete un "ganador".
    expect(summary.winner).toBeNull()
    // Pero MI resultado sí se conoce (ya jugué) — es la señal anti-spoiler que
    // decide si la fila va a jugar o al detalle (ver MarcadorTab.test.tsx).
    expect(summary.myResult).toEqual({ points: 3100, distanceKm: null, leftApp: false })
  })

  test('un reto CERRADO tiene status "closed" y SÍ lleva ganador', async () => {
    getGroupChallengesMock.mockResolvedValue([closedChallenge({ id: 'c1' })])
    getGroupVotesMock.mockResolvedValue([
      makeVote({ id: 'v1', challenge_id: 'c1', user_id: 'u-otro', points: 4880 }),
    ])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(1))

    expect(result.current.pastChallenges[0].status).toBe('closed')
    expect(result.current.pastChallenges[0].winner?.points).toBe(4880)
  })

  test('orden: los EN JUEGO primero (el que cierra antes, primero), luego los CERRADOS (más reciente primero)', async () => {
    getGroupChallengesMock.mockResolvedValue([
      activeChallenge({
        id: 'c-activo-lejos',
        title: 'Activo (cierra en 5h)',
        deadline_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      }),
      activeChallenge({
        id: 'c-activo-cerca',
        title: 'Activo (cierra en 1h)',
        deadline_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      closedChallenge({ id: 'c-cerrado', title: 'Cerrado' }),
    ])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.pastChallenges).toHaveLength(3))

    expect(result.current.pastChallenges.map((c) => c.title)).toEqual([
      'Activo (cierra en 1h)',
      'Activo (cierra en 5h)',
      'Cerrado',
    ])
  })
})

// Issue #566 / migración 0037: el diario ordena por `happened_on` (fecha
// ELEGIDA) con fallback a `created_at` para momentos legado sin fecha propia —
// ya no basta con invertir el orden de subida (`getGroupChallenges`, DESC).
describe('useTripData — orden por happened_on con fallback a created_at (issue #566)', () => {
  test('un recuerdo SUBIDO más tarde pero OCURRIDO antes se ordena por su happened_on', async () => {
    // Caso real del issue: backfill. Ambos se SUBEN el mismo día (created_at muy
    // cercanos), pero "Playa" ocurrió DESPUÉS que "Cena" según la fecha elegida.
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({
        id: 'c-playa',
        title: 'Playa',
        happened_on: '2026-06-15',
        created_at: '2026-07-01T10:00:00.000Z',
      }),
      closedChallenge({
        id: 'c-cena',
        title: 'Cena',
        happened_on: '2026-06-10',
        created_at: '2026-07-01T10:01:00.000Z',
      }),
    ])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(2))

    // ASC: Cena (10 jun) antes que Playa (15 jun), aunque se subió después.
    expect(result.current.moments.map((m) => m.title)).toEqual(['Cena', 'Playa'])
  })

  test('mezcla de legado (sin happened_on) y nuevo (con happened_on) intercala por fecha efectiva', async () => {
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({
        id: 'c-legado',
        title: 'Legado',
        happened_on: null,
        created_at: '2026-06-12T10:00:00.000Z',
      }),
      closedChallenge({
        id: 'c-nuevo',
        title: 'Nuevo con fecha',
        happened_on: '2026-06-20',
        created_at: '2026-07-01T10:00:00.000Z',
      }),
    ])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(2))

    // El legado (created_at 12 jun) va antes que el nuevo (happened_on 20 jun).
    expect(result.current.moments.map((m) => m.title)).toEqual(['Legado', 'Nuevo con fecha'])
  })

  test('empate en el MISMO happened_on se desempata por created_at (orden de entrada real)', async () => {
    getGroupChallengesMock.mockResolvedValue([
      closedChallenge({
        id: 'c-tarde',
        title: 'Subido tarde',
        happened_on: '2026-06-15',
        created_at: '2026-07-01T10:05:00.000Z',
      }),
      closedChallenge({
        id: 'c-temprano',
        title: 'Subido temprano',
        happened_on: '2026-06-15',
        created_at: '2026-07-01T10:00:00.000Z',
      }),
    ])
    getGroupVotesMock.mockResolvedValue([])

    const { result } = renderHook(() => useTripData('g1', 'u-me'))
    await waitFor(() => expect(result.current.moments).toHaveLength(2))

    expect(result.current.moments.map((m) => m.title)).toEqual(['Subido temprano', 'Subido tarde'])
  })
})
