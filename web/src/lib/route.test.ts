import { describe, test, expect } from 'vitest'
import { parseHash, groupHash } from './route'

describe('parseHash', () => {
  test('grupo y reto juntos', () => {
    expect(parseHash('#g=abc123&c=11111111-2222-3333-4444-555555555555')).toEqual({
      view: 'home',
      group: 'abc123',
      challenge: '11111111-2222-3333-4444-555555555555',
    })
  })

  test('solo grupo', () => {
    expect(parseHash('#g=abc123')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('solo reto', () => {
    expect(parseHash('#c=uuid')).toEqual({ view: 'home', challenge: 'uuid' })
  })

  test('hash vacío o solo # → home', () => {
    expect(parseHash('')).toEqual({ view: 'home' })
    expect(parseHash('#')).toEqual({ view: 'home' })
  })

  test('orden de claves indiferente', () => {
    expect(parseHash('#c=cc&g=gg')).toEqual({ view: 'home', group: 'gg', challenge: 'cc' })
  })

  test('acepta hash sin almohadilla inicial', () => {
    expect(parseHash('g=gg')).toEqual({ view: 'home', group: 'gg' })
  })

  test('decodifica valores percent-encoded', () => {
    expect(parseHash('#g=a%20b')).toEqual({ view: 'home', group: 'a b' })
  })

  test('ignora claves desconocidas', () => {
    expect(parseHash('#g=gg&x=1&foo=bar')).toEqual({ view: 'home', group: 'gg' })
  })

  test('valores vacíos se omiten', () => {
    expect(parseHash('#g=&c=')).toEqual({ view: 'home' })
  })

  test('#nuevo → vista crear grupo', () => {
    expect(parseHash('#nuevo')).toEqual({ view: 'new' })
    expect(parseHash('nuevo')).toEqual({ view: 'new' })
  })

  test('#perfil → vista perfil', () => {
    expect(parseHash('#perfil')).toEqual({ view: 'profile' })
  })

  test('el deep link de grupo gana sobre las vistas de app', () => {
    // Un hash con `=` no es una vista atómica; "nuevo" como valor de `g` es grupo.
    expect(parseHash('#g=nuevo')).toEqual({ view: 'home', group: 'nuevo' })
  })
})

describe('groupHash', () => {
  test('solo grupo', () => {
    expect(groupHash('abc123')).toBe('#g=abc123')
  })

  test('grupo y reto', () => {
    expect(groupHash('abc123', 'uuid-1')).toBe('#g=abc123&c=uuid-1')
  })
})
