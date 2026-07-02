import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Session } from '@supabase/supabase-js'

// auth.ts importa ./supabase, que lanza sin env vars. Mockeamos solo lo que
// usan los helpers de destino (no tocan supabase, pero el import debe resolver).
const signOutMock = vi.fn(async () => ({ error: null }))
vi.mock('./supabase', () => ({ supabase: { auth: { signOut: () => signOutMock() } } }))

import {
  setNextDestination,
  getNextDestination,
  takeNextDestination,
  clearLegacyAnonymousSession,
  takeLegacySessionNotice,
} from './auth'

beforeEach(() => {
  localStorage.clear()
  signOutMock.mockClear()
})

describe('destino deep-link (lg.next)', () => {
  test('guarda y lee el destino', () => {
    setNextDestination('#g=ABC&c=uuid')
    expect(getNextDestination()).toBe('#g=ABC&c=uuid')
  })

  test('no guarda destino vacío', () => {
    setNextDestination('')
    expect(getNextDestination()).toBeNull()
  })

  test('take devuelve y borra (uso único)', () => {
    setNextDestination('#g=ABC')
    expect(takeNextDestination()).toBe('#g=ABC')
    expect(getNextDestination()).toBeNull()
    expect(takeNextDestination()).toBeNull()
  })
})

// Base mínima de sesión para las pruebas del gate de sesión legada.
function fakeSession(userOverrides: Record<string, unknown>): Session {
  return {
    access_token: 't',
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    user: { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated', ...userOverrides },
  } as unknown as Session
}

describe('clearLegacyAnonymousSession (issue #514)', () => {
  test('sin sesión → no actúa', async () => {
    expect(await clearLegacyAnonymousSession(null)).toBe(false)
    expect(signOutMock).not.toHaveBeenCalled()
  })

  test('sesión NO anónima → no actúa', async () => {
    const session = fakeSession({ is_anonymous: false, email_confirmed_at: '2026-01-01' })
    expect(await clearLegacyAnonymousSession(session)).toBe(false)
    expect(signOutMock).not.toHaveBeenCalled()
  })

  test('sesión ANÓNIMA legada → cierra sesión y marca el aviso', async () => {
    const session = fakeSession({ is_anonymous: true })
    expect(await clearLegacyAnonymousSession(session)).toBe(true)
    expect(signOutMock).toHaveBeenCalledTimes(1)
    // El aviso queda pendiente para la landing, y se consume una sola vez.
    expect(takeLegacySessionNotice()).toBe(true)
    expect(takeLegacySessionNotice()).toBe(false)
  })
})

describe('takeLegacySessionNotice', () => {
  test('sin aviso pendiente → false', () => {
    expect(takeLegacySessionNotice()).toBe(false)
  })
})
