import { describe, test, expect, vi, beforeEach } from 'vitest'

// auth.ts importa ./supabase, que lanza sin env vars. Mockeamos solo lo que
// usan los helpers de destino (no tocan supabase, pero el import debe resolver).
vi.mock('./supabase', () => ({ supabase: { auth: {} } }))

import { setNextDestination, getNextDestination, takeNextDestination } from './auth'

beforeEach(() => {
  localStorage.clear()
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
