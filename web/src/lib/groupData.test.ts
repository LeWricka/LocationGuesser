import { describe, test, expect, vi } from 'vitest'

// El módulo importa `./supabase`, que lanza sin env vars. Mockeamos un cliente
// encadenable: aísla las funciones puras y deja inspeccionar el update de premios,
// el rename y el delete del grupo.
const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
const deleteSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
vi.mock('./supabase', () => ({
  supabase: { from: vi.fn(() => ({ update: updateSpy, delete: deleteSpy })) },
}))

import {
  deleteGroup,
  isLive,
  normalizePrizes,
  splitByStatus,
  updateGroupName,
  updateGroupPrizes,
} from './groupData'

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

describe('normalizePrizes', () => {
  test('recorta cada premio y mantiene el orden de los puestos', () => {
    expect(normalizePrizes({ first: '  elige restaurante  ', last: ' paga las cañas ' })).toEqual({
      first: 'elige restaurante',
      last: 'paga las cañas',
    })
  })

  test('descarta claves vacías o de solo espacios', () => {
    expect(normalizePrizes({ first: 'manda', second: '   ', third: '' })).toEqual({
      first: 'manda',
    })
  })

  test('todas vacías → null (borra los premios)', () => {
    expect(normalizePrizes({ first: '  ', last: '' })).toBeNull()
    expect(normalizePrizes({})).toBeNull()
  })
})

describe('updateGroupPrizes', () => {
  test('guarda el jsonb normalizado (recortado, sin claves vacías)', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', { first: '  manda  ', second: '   ', last: 'invita' })
    expect(updateSpy).toHaveBeenCalledWith({ prizes: { first: 'manda', last: 'invita' } })
  })

  test('todos los premios vacíos → null', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', { first: '   ', last: '' })
    expect(updateSpy).toHaveBeenCalledWith({ prizes: null })
  })
})

describe('updateGroupName', () => {
  test('recorta el nombre y lo guarda', async () => {
    updateSpy.mockClear()
    await updateGroupName('ABC', '  Finde en Madrid  ')
    expect(updateSpy).toHaveBeenCalledWith({ name: 'Finde en Madrid' })
  })

  test('nombre vacío → null (cae al código del grupo)', async () => {
    updateSpy.mockClear()
    await updateGroupName('ABC', '   ')
    expect(updateSpy).toHaveBeenCalledWith({ name: null })
  })
})

describe('deleteGroup', () => {
  test('borra el grupo por su id', async () => {
    deleteSpy.mockClear()
    await deleteGroup('ABC')
    expect(deleteSpy).toHaveBeenCalled()
  })
})
