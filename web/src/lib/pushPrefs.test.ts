import { describe, test, expect, vi, beforeEach } from 'vitest'

// La API real de Supabase se mockea: estos tests cubren la lógica pura de
// "ausente = activada" y el merge de `setPushPref`, no la red.
const updateMock = vi.fn()
const eqMock = vi.fn()
const fromMock = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}))

import { isPushKindEnabled, setPushPref } from './pushPrefs'
import type { PushPrefs } from './database.types'

beforeEach(() => {
  eqMock.mockReset().mockResolvedValue({ error: null })
  updateMock.mockReset().mockReturnValue({ eq: eqMock })
  fromMock.mockReset().mockReturnValue({ update: updateMock })
})

describe('isPushKindEnabled', () => {
  test('la clave ausente cuenta como activada', () => {
    expect(isPushKindEnabled({}, 'created')).toBe(true)
    expect(isPushKindEnabled(undefined, 'memory')).toBe(true)
    expect(isPushKindEnabled(null, 'closed')).toBe(true)
  })

  test('respeta el valor explícito, activado o desactivado', () => {
    expect(isPushKindEnabled({ created: false }, 'created')).toBe(false)
    expect(isPushKindEnabled({ created: true }, 'created')).toBe(true)
  })

  test('un tipo desactivado no afecta a los demás (ausentes = activados)', () => {
    const prefs: PushPrefs = { memory: false }
    expect(isPushKindEnabled(prefs, 'memory')).toBe(false)
    expect(isPushKindEnabled(prefs, 'created')).toBe(true)
    expect(isPushKindEnabled(prefs, 'closed')).toBe(true)
    expect(isPushKindEnabled(prefs, 'trip_closed')).toBe(true)
  })
})

describe('setPushPref', () => {
  test('fusiona la clave nueva con las preferencias existentes (no las pisa)', async () => {
    const result = await setPushPref('u1', 'closed', false, { memory: false })
    expect(result).toEqual({ memory: false, closed: false })
    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(updateMock).toHaveBeenCalledWith({ push_prefs: { memory: false, closed: false } })
    expect(eqMock).toHaveBeenCalledWith('id', 'u1')
  })

  test('sin preferencias previas (columna aún no migrada) parte de un objeto vacío', async () => {
    const result = await setPushPref('u1', 'created', false, undefined)
    expect(result).toEqual({ created: false })
    expect(updateMock).toHaveBeenCalledWith({ push_prefs: { created: false } })
  })

  test('propaga el error de Supabase sin tragárselo', async () => {
    eqMock.mockResolvedValue({ error: new Error('boom') })
    await expect(setPushPref('u1', 'created', true, {})).rejects.toThrow('boom')
  })
})
