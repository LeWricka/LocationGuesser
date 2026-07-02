import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del cliente de Supabase: un builder por tabla que resuelve con lo que
// fijemos en `results` según la tabla consultada. Cada llamada a `.from(table)`
// devuelve un builder encadenable cuyo `then` resuelve `{ data, error }`.
const results: Record<string, { data: unknown; error: unknown }> = {}
const upsertCalls = vi.fn()
const updateCalls = vi.fn()
const deleteCalls = vi.fn()
const eqCalls = vi.fn()

function builderFor(table: string) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'in']) {
    builder[m] = () => builder
  }
  builder.eq = (...args: unknown[]) => {
    eqCalls(table, ...args)
    return builder
  }
  builder.upsert = (...args: unknown[]) => {
    upsertCalls(table, ...args)
    return builder
  }
  builder.update = (...args: unknown[]) => {
    updateCalls(table, ...args)
    return builder
  }
  builder.delete = (...args: unknown[]) => {
    deleteCalls(table, ...args)
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

import {
  joinGroup,
  isMember,
  myGroups,
  pendingChallenges,
  getGroupMembers,
  leaveGroup,
  kickMember,
  setMemberRole,
  transferOwnership,
} from './membership'

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

  test('excluye los retos creados por el propio usuario (#509)', async () => {
    const soon = new Date(Date.now() + 60_000).toISOString()
    results['group_members'] = {
      data: [{ group_id: 'g1', role: 'owner', groups: { id: 'g1', name: 'A', created_by: 'u1' } }],
      error: null,
    }
    results['challenges'] = {
      data: [
        { id: 'c-mine', group_id: 'g1', deadline_at: soon, created_by: 'u1' },
        { id: 'c-otros', group_id: 'g1', deadline_at: soon, created_by: 'u2' },
      ],
      error: null,
    }
    results['votes'] = { data: [], error: null }

    const pending = await pendingChallenges('u1')
    expect(pending.map((p) => p.challenge.id)).toEqual(['c-otros'])
  })
})

describe('getGroupMembers', () => {
  test('combina rol + nombre y pone al dueño primero', async () => {
    results['group_members'] = {
      data: [
        { user_id: 'u-member', role: 'member' },
        { user_id: 'u-owner', role: 'owner' },
      ],
      error: null,
    }
    results['groups'] = { data: { created_by: 'u-owner' }, error: null }
    results['profiles'] = {
      data: [
        { id: 'u-owner', display_name: 'Ana' },
        { id: 'u-member', display_name: 'Bea' },
      ],
      error: null,
    }
    const members = await getGroupMembers('g1')
    expect(members[0].userId).toBe('u-owner')
    expect(members[0].isOwner).toBe(true)
    expect(members[0].isCreator).toBe(true)
    expect(members[0].name).toBe('Ana')
    expect(members[1].isOwner).toBe(false)
    expect(members[1].isCreator).toBe(false)
    expect(members[1].name).toBe('Bea')
  })

  test('un co-dueño (role owner, no creador) es owner pero no creator', async () => {
    results['group_members'] = {
      data: [
        { user_id: 'u-creator', role: 'owner' },
        { user_id: 'u-coowner', role: 'owner' },
        { user_id: 'u-plain', role: 'member' },
      ],
      error: null,
    }
    results['groups'] = { data: { created_by: 'u-creator' }, error: null }
    results['profiles'] = {
      data: [
        { id: 'u-creator', display_name: 'Ana' },
        { id: 'u-coowner', display_name: 'Bob' },
        { id: 'u-plain', display_name: 'Cris' },
      ],
      error: null,
    }
    const members = await getGroupMembers('g1')
    const byId = Object.fromEntries(members.map((m) => [m.userId, m]))
    expect(byId['u-creator']).toMatchObject({ isOwner: true, isCreator: true })
    expect(byId['u-coowner']).toMatchObject({ isOwner: true, isCreator: false })
    expect(byId['u-plain']).toMatchObject({ isOwner: false, isCreator: false })
  })

  test('sin miembros devuelve []', async () => {
    results['group_members'] = { data: [], error: null }
    results['groups'] = { data: { created_by: 'x' }, error: null }
    expect(await getGroupMembers('g1')).toEqual([])
  })
})

describe('leaveGroup', () => {
  test('borra la fila propia si NO soy el dueño', async () => {
    results['groups'] = { data: { created_by: 'otro' }, error: null }
    await leaveGroup('g1', 'u1')
    expect(deleteCalls).toHaveBeenCalledWith('group_members')
    expect(eqCalls).toHaveBeenCalledWith('group_members', 'group_id', 'g1')
    expect(eqCalls).toHaveBeenCalledWith('group_members', 'user_id', 'u1')
  })

  test('el DUEÑO no puede salir (debe transferir antes)', async () => {
    results['groups'] = { data: { created_by: 'u1' }, error: null }
    await expect(leaveGroup('g1', 'u1')).rejects.toThrow(/dueño/)
    expect(deleteCalls).not.toHaveBeenCalled()
  })
})

describe('kickMember', () => {
  test('borra la fila del miembro expulsado', async () => {
    results['group_members'] = { data: null, error: null }
    await kickMember('g1', 'u-victim')
    expect(deleteCalls).toHaveBeenCalledWith('group_members')
    expect(eqCalls).toHaveBeenCalledWith('group_members', 'user_id', 'u-victim')
  })
})

describe('setMemberRole', () => {
  test('promueve a co-dueño (role owner) del miembro indicado', async () => {
    results['group_members'] = { data: null, error: null }
    await setMemberRole('g1', 'u-member', 'owner')
    expect(updateCalls).toHaveBeenCalledWith('group_members', { role: 'owner' })
    expect(eqCalls).toHaveBeenCalledWith('group_members', 'group_id', 'g1')
    expect(eqCalls).toHaveBeenCalledWith('group_members', 'user_id', 'u-member')
  })

  test('degrada a miembro (role member)', async () => {
    results['group_members'] = { data: null, error: null }
    await setMemberRole('g1', 'u-coowner', 'member')
    expect(updateCalls).toHaveBeenCalledWith('group_members', { role: 'member' })
  })

  test('propaga el error de la RLS', async () => {
    results['group_members'] = { data: null, error: new Error('denied') }
    await expect(setMemberRole('g1', 'u', 'owner')).rejects.toThrow('denied')
  })
})

describe('transferOwnership', () => {
  test('promueve al nuevo dueño, degrada al actual y mueve created_by', async () => {
    results['group_members'] = { data: null, error: null }
    results['groups'] = { data: null, error: null }
    await transferOwnership('g1', 'u-new', 'u-old')
    // Dos updates de roles en group_members + uno de created_by en groups.
    expect(updateCalls).toHaveBeenCalledWith('group_members', { role: 'owner' })
    expect(updateCalls).toHaveBeenCalledWith('group_members', { role: 'member' })
    expect(updateCalls).toHaveBeenCalledWith('groups', { created_by: 'u-new' })
  })

  test('propaga si falla el primer paso (sin tocar created_by)', async () => {
    results['group_members'] = { data: null, error: new Error('denied') }
    await expect(transferOwnership('g1', 'u-new', 'u-old')).rejects.toThrow('denied')
    expect(updateCalls).not.toHaveBeenCalledWith('groups', { created_by: 'u-new' })
  })
})
