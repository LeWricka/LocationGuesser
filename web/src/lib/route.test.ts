import { describe, test, expect } from 'vitest'
import { parseHash } from './route'

describe('parseHash', () => {
  test('grupo y reto juntos', () => {
    expect(parseHash('#g=abc123&c=11111111-2222-3333-4444-555555555555')).toEqual({
      group: 'abc123',
      challenge: '11111111-2222-3333-4444-555555555555',
    })
  })

  test('solo grupo', () => {
    expect(parseHash('#g=abc123')).toEqual({ group: 'abc123' })
  })

  test('solo reto', () => {
    expect(parseHash('#c=uuid')).toEqual({ challenge: 'uuid' })
  })

  test('hash vacío o solo #', () => {
    expect(parseHash('')).toEqual({})
    expect(parseHash('#')).toEqual({})
  })

  test('orden de claves indiferente', () => {
    expect(parseHash('#c=cc&g=gg')).toEqual({ group: 'gg', challenge: 'cc' })
  })

  test('acepta hash sin almohadilla inicial', () => {
    expect(parseHash('g=gg')).toEqual({ group: 'gg' })
  })

  test('decodifica valores percent-encoded', () => {
    expect(parseHash('#g=a%20b')).toEqual({ group: 'a b' })
  })

  test('ignora claves desconocidas', () => {
    expect(parseHash('#g=gg&x=1&foo=bar')).toEqual({ group: 'gg' })
  })

  test('valores vacíos se omiten', () => {
    expect(parseHash('#g=&c=')).toEqual({})
  })
})
