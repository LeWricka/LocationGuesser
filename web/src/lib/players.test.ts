import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Player } from './database.types'

// Stub encadenable del query builder de Supabase (mismo patrón que votes.test).
// `maybeSingle` resuelve la lectura de getPlayer; `single` resuelve el insert.
// Cada uno toma su propio resultado para poder simular "libre", "existe",
// "PIN ok/ko" y la carrera por el unique (group_id, name).
const calls = {
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}
type QueryResult = { data: unknown; error: unknown }
// Cola de resultados para las lecturas (maybeSingle): cada llamada consume el
// siguiente, así una misma prueba puede simular "libre" y luego "ganador".
let selectQueue: QueryResult[] = []
let insertResult: QueryResult = { data: null, error: null }

const builder = {
  insert: (...args: unknown[]) => {
    calls.insert(...args)
    return builder
  },
  select: (...args: unknown[]) => {
    calls.select(...args)
    return builder
  },
  eq: (...args: unknown[]) => {
    calls.eq(...args)
    return builder
  },
  // getPlayer termina en maybeSingle; ensurePlayer (insert) en single.
  maybeSingle: () => Promise.resolve(selectQueue.shift() ?? { data: null, error: null }),
  single: () => Promise.resolve(insertResult),
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.from(table)
      return builder
    },
  },
}))

import { getPlayer, ensurePlayer } from './players'

const samplePlayer: Player = {
  id: 'p1',
  group_id: 'g1',
  name: 'Ana',
  client_id: 'client-1',
  pin_hash: 'hash-ana',
  created_at: '2026-06-19T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  selectQueue = []
  insertResult = { data: null, error: null }
})

describe('getPlayer', () => {
  test('filtra por group_id y name y devuelve la fila', async () => {
    selectQueue = [{ data: samplePlayer, error: null }]
    const out = await getPlayer('g1', 'Ana')
    expect(calls.from).toHaveBeenCalledWith('players')
    expect(calls.eq).toHaveBeenCalledWith('group_id', 'g1')
    expect(calls.eq).toHaveBeenCalledWith('name', 'Ana')
    expect(out).toEqual(samplePlayer)
  })

  test('null si el nombre está libre en el grupo', async () => {
    expect(await getPlayer('g1', 'Nadie')).toBeNull()
  })
})

describe('ensurePlayer', () => {
  test('created: nombre libre → inserta la fila', async () => {
    selectQueue = [{ data: null, error: null }]
    insertResult = { data: samplePlayer, error: null }
    const out = await ensurePlayer({
      groupId: 'g1',
      name: 'Ana',
      clientId: 'client-1',
      pinHash: 'hash-ana',
    })
    expect(calls.insert).toHaveBeenCalledWith({
      group_id: 'g1',
      name: 'Ana',
      client_id: 'client-1',
      pin_hash: 'hash-ana',
    })
    expect(out).toEqual({ status: 'created', player: samplePlayer })
  })

  test('claimed: el nombre existe y el pin_hash coincide', async () => {
    selectQueue = [{ data: samplePlayer, error: null }]
    const out = await ensurePlayer({
      groupId: 'g1',
      name: 'Ana',
      clientId: 'otro-movil',
      pinHash: 'hash-ana',
    })
    expect(calls.insert).not.toHaveBeenCalled()
    expect(out).toEqual({ status: 'claimed', player: samplePlayer })
  })

  test('wrong-pin: el nombre existe pero el pin_hash no coincide', async () => {
    selectQueue = [{ data: samplePlayer, error: null }]
    const out = await ensurePlayer({
      groupId: 'g1',
      name: 'Ana',
      clientId: 'intruso',
      pinHash: 'hash-distinto',
    })
    expect(out).toEqual({ status: 'wrong-pin' })
  })

  test('carrera: unique_violation (23505) → relee y resuelve contra el ganador', async () => {
    // 1ª lectura: libre. INSERT choca con el unique. 2ª lectura: ya ve la fila
    // ganadora con el mismo pin → claimed.
    selectQueue = [
      { data: null, error: null },
      { data: samplePlayer, error: null },
    ]
    insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const out = await ensurePlayer({
      groupId: 'g1',
      name: 'Ana',
      clientId: 'client-1',
      pinHash: 'hash-ana',
    })
    expect(out).toEqual({ status: 'claimed', player: samplePlayer })
  })

  test('propaga errores de insert que no son unique_violation', async () => {
    selectQueue = [{ data: null, error: null }]
    insertResult = { data: null, error: { code: '500', message: 'boom' } }
    await expect(
      ensurePlayer({ groupId: 'g1', name: 'Ana', clientId: 'c', pinHash: 'h' }),
    ).rejects.toMatchObject({ message: 'boom' })
  })
})
