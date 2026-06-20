import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del cliente de Supabase: un builder por tabla que resuelve con lo que
// fijemos en `results` según la tabla consultada. Cada llamada a `.from(table)`
// devuelve un builder encadenable cuyo `then` resuelve `{ data, error }`.
const results: Record<string, { data: unknown; error: unknown }> = {}
const upsertCalls = vi.fn()

function builderFor(table: string) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in']) {
    builder[m] = () => builder
  }
  builder.upsert = (...args: unknown[]) => {
    upsertCalls(table, ...args)
    return builder
  }
  builder.maybeSingle = () => Promise.resolve(results[table] ?? { data: null, error: null })
  builder.then = (resolve: (r: unknown) => unknown) =>
    resolve(results[table] ?? { data: [], error: null })
  return builder
}

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => builderFor(table) },
}))

import { joinGroup, isMember, myGroups, pendingChallenges } from './membership'

const FAR_FUTURE = '2999-01-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(results)) delete results[k]
})

describe('joinGroup', () => {
  test('upsert idempotente de la fila propia con onConflict group_id,user_id', async () => {
    results['group_members'] = { data: null, error: null }
    await joinGroup('g1', 'u1')
    expect(upsertCalls).toHaveBeenCalledWith(
      'group_members',
      { group_id: 'g1', user_id: 'u1' },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    )
  })

  test('propaga el error', async () => {
    results['group_members'] = { data: null, error: new Error('boom') }
    await expect(joinGroup('g1', 'u1')).rejects.toThrow('boom')
  })
})

describe('isMember', () => {
  test('true si hay fila', async () => {
    results['group_members'] = { data: { group_id: 'g1' }, error: null }
    expect(await isMember('g1', 'u1')).toBe(true)
  })
  test('false si no hay fila', async () => {
    results['group_members'] = { data: null, error: null }
    expect(await isMember('g1', 'u1')).toBe(false)
  })
})

describe('myGroups', () => {
  test('deriva el estado de cada grupo y marca al dueño', async () => {
    results['group_members'] = {
      data: [
        { group_id: 'g1', role: 'owner', groups: { id: 'g1', name: 'A', created_by: 'u1' } },
        { group_id: 'g2', role: 'member', groups: { id: 'g2', name: 'B', created_by: 'otro' } },
        { group_id: 'g3', role: 'member', groups: { id: 'g3', name: 'C', created_by: 'otro' } },
      ],
      error: null,
    }
    results['challenges'] = {
      data: [
        { id: 'c1', group_id: 'g1', deadline_at: FAR_FUTURE }, // abierto, sin votar → your-turn
        { id: 'c2', group_id: 'g2', deadline_at: FAR_FUTURE }, // abierto, votado → live
        { id: 'c3', group_id: 'g3', deadline_at: PAST }, // cerrado → idle
      ],
      error: null,
    }
    results['votes'] = { data: [{ challenge_id: 'c2' }], error: null }

    const groups = await myGroups('u1')
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId.g1.status).toBe('your-turn')
    expect(byId.g1.isOwner).toBe(true)
    expect(byId.g2.status).toBe('live')
    expect(byId.g2.isOwner).toBe(false)
    expect(byId.g3.status).toBe('idle')
  })

  test('sin membresías devuelve []', async () => {
    results['group_members'] = { data: [], error: null }
    expect(await myGroups('u1')).toEqual([])
  })
})

describe('pendingChallenges', () => {
  test('solo retos abiertos sin votar, ordenados por deadline más próxima', async () => {
    const soon = new Date(Date.now() + 60_000).toISOString()
    const later = new Date(Date.now() + 3_600_000).toISOString()
    results['group_members'] = {
      data: [{ group_id: 'g1', role: 'member', groups: { id: 'g1', name: 'A', created_by: 'x' } }],
      error: null,
    }
    results['challenges'] = {
      data: [
        { id: 'c-later', group_id: 'g1', deadline_at: later },
        { id: 'c-soon', group_id: 'g1', deadline_at: soon },
        { id: 'c-voted', group_id: 'g1', deadline_at: soon },
        { id: 'c-closed', group_id: 'g1', deadline_at: PAST },
      ],
      error: null,
    }
    results['votes'] = { data: [{ challenge_id: 'c-voted' }], error: null }

    const pending = await pendingChallenges('u1')
    expect(pending.map((p) => p.challenge.id)).toEqual(['c-soon', 'c-later'])
    expect(pending[0].groupName).toBe('A')
  })
})
