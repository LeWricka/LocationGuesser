import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

const identifyUser = vi.fn()
const resetAnalytics = vi.fn()
const track = vi.fn()
vi.mock('./analytics', () => ({
  identifyUser: (...args: unknown[]) => identifyUser(...args),
  resetAnalytics: () => resetAnalytics(),
  track: (...args: unknown[]) => track(...args),
}))

const setObservabilityUser = vi.fn()
const clearObservabilityUser = vi.fn()
vi.mock('./observability', () => ({
  setObservabilityUser: (...args: unknown[]) => setObservabilityUser(...args),
  clearObservabilityUser: () => clearObservabilityUser(),
}))

import { useAnalyticsIdentity } from './useAnalyticsIdentity'
import { SessionContext, type SessionState } from './session-context'

function baseSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session: null,
    user: null,
    profile: null,
    loading: false,
    verified: false,
    isAnonymous: false,
    refreshProfile: async () => {},
    ...overrides,
  }
}

function wrapper(value: SessionState) {
  return ({ children }: { children: ReactNode }) => (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

function freshUser(overrides: Partial<User> = {}): User {
  const now = new Date().toISOString()
  return {
    id: 'u1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: now,
    last_sign_in_at: now,
    ...overrides,
  } as User
}

beforeEach(() => {
  identifyUser.mockClear()
  resetAnalytics.mockClear()
  track.mockClear()
  setObservabilityUser.mockClear()
  clearObservabilityUser.mockClear()
})

// Issue #751: `signup_completed`/`login` no deben contar sesiones ANÓNIMAS
// (`signInAnonymously`, receptor sin cuenta #758) — su alta real es
// `account_upgraded` (useAccountUpgrade), no este hook.
describe('useAnalyticsIdentity — guarda de sesión anónima (issue #751)', () => {
  test('alta anónima (created_at ~ last_sign_in_at, isAnonymous): NO emite signup_completed ni login', () => {
    const user = freshUser()
    renderHook(() => useAnalyticsIdentity(), {
      wrapper: wrapper(baseSession({ user, isAnonymous: true })),
    })

    expect(identifyUser).toHaveBeenCalledWith({
      id: 'u1',
      email: undefined,
      name: undefined,
      avatar: undefined,
    })
    expect(setObservabilityUser).toHaveBeenCalledWith('u1')
    expect(track).not.toHaveBeenCalled()
  })

  test('alta real (misma ventana, NO anónima): sí emite signup_completed', () => {
    const user = freshUser()
    renderHook(() => useAnalyticsIdentity(), {
      wrapper: wrapper(baseSession({ user, isAnonymous: false })),
    })

    expect(track).toHaveBeenCalledWith('signup_completed')
    expect(track).toHaveBeenCalledTimes(1)
  })

  test('login recurrente (created_at lejano, NO anónima): emite login, no signup_completed', () => {
    const user = freshUser({ created_at: '2020-01-01T00:00:00.000Z' })
    renderHook(() => useAnalyticsIdentity(), {
      wrapper: wrapper(baseSession({ user, isAnonymous: false })),
    })

    expect(track).toHaveBeenCalledWith('login')
    expect(track).not.toHaveBeenCalledWith('signup_completed')
  })

  test('login recurrente de una sesión anónima (caso límite): tampoco emite login', () => {
    const user = freshUser({ created_at: '2020-01-01T00:00:00.000Z' })
    renderHook(() => useAnalyticsIdentity(), {
      wrapper: wrapper(baseSession({ user, isAnonymous: true })),
    })

    expect(track).not.toHaveBeenCalled()
  })

  test('sin sesión: no identifica ni emite nada', () => {
    renderHook(() => useAnalyticsIdentity(), { wrapper: wrapper(baseSession({ user: null })) })

    expect(identifyUser).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
    // Sin identificación previa en este montaje, no hay nada que resetear.
    expect(resetAnalytics).not.toHaveBeenCalled()
  })
})
