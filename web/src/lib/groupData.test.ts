import { describe, test, expect, vi } from 'vitest'

// El módulo importa `./supabase`, que lanza sin env vars. Mockeamos un cliente
// encadenable: aísla las funciones puras y deja inspeccionar el update de premios.
const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(() => ({ update: updateSpy })) },
}))

import { isLive, splitByStatus, updateGroupPrizes } from './groupData'

const now = new Date('2026-06-19T12:00:00.000Z')
const future = '2026-06-19T18:00:00.000Z'
const past = '2026-06-19T06:00:00.000Z'

describe('isLive', () => {
  test('plazo futuro está en vivo', () => {
    expect(isLive({ deadline_at: future }, now)).toBe(true)
  })

  test('plazo pasado está cerrado', () => {
    expect(isLive({ deadline_at: past }, now)).toBe(false)
  })
})

describe('splitByStatus', () => {
  test('separa en vivo de anteriores conservando el orden', () => {
    const challenges = [
      { id: 'a', deadline_at: future },
      { id: 'b', deadline_at: past },
      { id: 'c', deadline_at: future },
    ]
    const { live, past: closed } = splitByStatus(challenges, now)
    expect(live.map((c) => c.id)).toEqual(['a', 'c'])
    expect(closed.map((c) => c.id)).toEqual(['b'])
  })

  test('lista vacía da dos listas vacías', () => {
    expect(splitByStatus([], now)).toEqual({ live: [], past: [] })
  })
})

describe('updateGroupPrizes', () => {
  test('recorta el texto antes de guardar', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', '  el último invita  ')
    expect(updateSpy).toHaveBeenCalledWith({ prizes: 'el último invita' })
  })

  test('texto vacío (o solo espacios) borra el premio: null', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', '   ')
    expect(updateSpy).toHaveBeenCalledWith({ prizes: null })
  })
})
