import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Profile } from './database.types'

const calls = { from: vi.fn(), upsert: vi.fn(), select: vi.fn(), eq: vi.fn() }
let result: { data: unknown; error: unknown } = { data: null, error: null }

const builder = {
  upsert: (...a: unknown[]) => {
    calls.upsert(...a)
    return builder
  },
  select: (...a: unknown[]) => {
    calls.select(...a)
    return builder
  },
  eq: (...a: unknown[]) => {
    calls.eq(...a)
    return builder
  },
  single: () => Promise.resolve(result),
  maybeSingle: () => Promise.resolve(result),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
  },
}))

import { getProfile, upsertProfile } from './profile'

const sample: Profile = {
  id: 'u1',
  display_name: 'Lewis',
  avatar_url: null,
  created_at: '2026-06-19T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('getProfile', () => {
  test('filtra por id y devuelve el perfil', async () => {
    result = { data: sample, error: null }
    const out = await getProfile('u1')
    expect(calls.from).toHaveBeenCalledWith('profiles')
    expect(calls.eq).toHaveBeenCalledWith('id', 'u1')
    expect(out).toEqual(sample)
  })

  test('null si no existe', async () => {
    expect(await getProfile('u1')).toBeNull()
  })
})

describe('upsertProfile', () => {
  test('upsert con display_name y, si viene, avatar', async () => {
    result = { data: sample, error: null }
    await upsertProfile({ id: 'u1', displayName: 'Lewis', avatarUrl: 'a.png' })
    expect(calls.upsert).toHaveBeenCalledWith({
      id: 'u1',
      display_name: 'Lewis',
      avatar_url: 'a.png',
    })
  })

  test('omite avatar_url si no se pasa', async () => {
    result = { data: sample, error: null }
    await upsertProfile({ id: 'u1', displayName: 'Lewis' })
    expect(calls.upsert).toHaveBeenCalledWith({ id: 'u1', display_name: 'Lewis' })
  })

  test('propaga el error', async () => {
    result = { data: null, error: new Error('boom') }
    await expect(upsertProfile({ id: 'u1', displayName: 'X' })).rejects.toThrow('boom')
  })
})
