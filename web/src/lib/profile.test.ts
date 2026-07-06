import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Profile } from './database.types'

const calls = { from: vi.fn(), upsert: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn() }
let result: { data: unknown; error: unknown } = { data: null, error: null }
let updateResult: { error: unknown } = { error: null }

const builder = {
  upsert: (...a: unknown[]) => {
    calls.upsert(...a)
    return builder
  },
  update: (...a: unknown[]) => {
    calls.update(...a)
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
  // Thenable: `.update(...).eq(...)` (persistOnboardingSeen) se resuelve
  // directo, SIN un terminal explícito como `.select().single()` — igual que
  // el query builder real de supabase-js, que también es awaitable a pelo.
  then: (resolve: (v: { error: unknown }) => void) => resolve(updateResult),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
  },
}))

import { getProfile, upsertProfile, persistOnboardingSeen } from './profile'

const sample: Profile = {
  id: 'u1',
  display_name: 'Lewis',
  avatar_url: null,
  created_at: '2026-06-19T00:00:00.000Z',
  onboarding: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  result = { data: null, error: null }
  updateResult = { error: null }
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

// Arreglo de raíz del onboarding repetido (issue #717): "visto" persistido EN
// EL PERFIL, no solo en localStorage.
describe('persistOnboardingSeen', () => {
  test('sin userId: solo localStorage, nunca toca la BD', async () => {
    await persistOnboardingSeen('group', undefined, null)
    expect(calls.from).not.toHaveBeenCalled()
    expect(localStorage.getItem('lg:onboarding:group:seen:anon')).toBe('1')
  })

  test('con userId: localStorage + merge con lo que ya traía el perfil', async () => {
    await persistOnboardingSeen('challenge', 'u1', { group: '2026-01-01T00:00:00.000Z' })
    expect(localStorage.getItem('lg:onboarding:challenge:seen:u1')).toBe('1')
    expect(calls.from).toHaveBeenCalledWith('profiles')
    expect(calls.update).toHaveBeenCalledTimes(1)
    const [payload] = calls.update.mock.calls[0] as [{ onboarding: Record<string, string> }]
    expect(payload.onboarding.group).toBe('2026-01-01T00:00:00.000Z')
    expect(typeof payload.onboarding.challenge).toBe('string')
    expect(calls.eq).toHaveBeenCalledWith('id', 'u1')
  })

  test('degradación honesta: si la BD falla, no lanza (localStorage ya quedó marcado)', async () => {
    updateResult = { error: new Error('column "onboarding" does not exist') }
    await expect(persistOnboardingSeen('group', 'u1', {})).resolves.toBeUndefined()
    expect(localStorage.getItem('lg:onboarding:group:seen:u1')).toBe('1')
  })
})
