import { describe, test, expect, beforeEach } from 'vitest'
import { getClientId, getIdentity, setIdentity, hashPin } from './identity'

beforeEach(() => {
  localStorage.clear()
})

describe('hashPin', () => {
  test('es determinista: el mismo PIN da el mismo hash', async () => {
    expect(await hashPin('1234')).toBe(await hashPin('1234'))
  })

  test('PINs distintos dan hashes distintos', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('4321'))
  })

  test('devuelve SHA-256 en hex (64 caracteres)', async () => {
    const hash = await hashPin('0000')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('getClientId', () => {
  test('genera un id estable y lo persiste', () => {
    const first = getClientId()
    expect(first).toBeTruthy()
    expect(getClientId()).toBe(first)
  })
})

describe('getIdentity / setIdentity', () => {
  test('null cuando no hay nombre ni pin', () => {
    expect(getIdentity()).toBeNull()
  })

  test('setIdentity guarda nombre + pin_hash y reusa el client_id', () => {
    const clientId = getClientId()
    const identity = setIdentity('Ana', 'hash-abc')
    expect(identity).toEqual({ clientId, name: 'Ana', pinHash: 'hash-abc' })
    expect(getIdentity()).toEqual({ clientId, name: 'Ana', pinHash: 'hash-abc' })
  })

  test('null si falta el pin_hash aunque haya nombre', () => {
    localStorage.setItem('lg.name', 'Ana')
    expect(getIdentity()).toBeNull()
  })
})
