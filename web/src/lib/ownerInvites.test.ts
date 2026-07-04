import { describe, test, expect, vi, beforeEach } from 'vitest'

// Stub encadenable mínimo: `createOwnerInvite` usa insert().select().single();
// `redeemOwnerInvite` usa rpc(). Mismo patrón que votes.test.ts (stub por tabla +
// stub de rpc), simplificado a lo que este fichero necesita.
const insertCalls = vi.fn()
const rpcCalls = vi.fn()
let singleResult: { data: unknown; error: unknown } = { data: null, error: null }
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }

function builder() {
  const b: Record<string, unknown> = {}
  b.insert = (...args: unknown[]) => {
    insertCalls(...args)
    return b
  }
  b.select = () => b
  b.single = () => Promise.resolve(singleResult)
  return b
}

vi.mock('./supabase', () => ({
  supabase: {
    from: () => builder(),
    rpc: (name: string, args: unknown) => {
      rpcCalls(name, args)
      return Promise.resolve(rpcResult)
    },
  },
}))

import { createOwnerInvite, redeemOwnerInvite } from './ownerInvites'

beforeEach(() => {
  vi.clearAllMocks()
  singleResult = { data: null, error: null }
  rpcResult = { data: null, error: null }
})

describe('createOwnerInvite', () => {
  test('inserta en group_invites con role owner y created_by, devuelve el token', async () => {
    singleResult = { data: { token: 'tok-1' }, error: null }
    const token = await createOwnerInvite('g1', 'u-me')
    expect(insertCalls).toHaveBeenCalledWith({ group_id: 'g1', role: 'owner', created_by: 'u-me' })
    expect(token).toBe('tok-1')
  })

  test('propaga un error de RLS (no-dueño) como Error legible', async () => {
    singleResult = {
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    }
    await expect(createOwnerInvite('g1', 'u-me')).rejects.toThrow(/row-level security/)
  })
})

describe('redeemOwnerInvite', () => {
  test('llama a la RPC redeem_owner_invite con el token y devuelve el group_id', async () => {
    rpcResult = { data: 'g1', error: null }
    const groupId = await redeemOwnerInvite('tok-1')
    expect(rpcCalls).toHaveBeenCalledWith('redeem_owner_invite', { invite_token: 'tok-1' })
    expect(groupId).toBe('g1')
  })

  test('token caducado/usado/inválido: propaga el mensaje del servidor', async () => {
    rpcResult = { data: null, error: { message: 'Este enlace de co-dueño ya se ha usado' } }
    await expect(redeemOwnerInvite('tok-1')).rejects.toThrow('ya se ha usado')
  })
})
