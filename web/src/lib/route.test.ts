import { describe, test, expect } from 'vitest'
import { parseHash, groupHash, classicGroupHash, addMomentHash, addChallengeHash } from './route'

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

  test('grupo sin v → pantalla Viaje (sin groupView)', () => {
    // Por defecto el grupo abre el "Viaje": parseHash no marca groupView.
    expect(parseHash('#g=abc123')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('v=clasico → escape a la GroupPage clásica', () => {
    expect(parseHash('#g=abc123&v=clasico')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'clasico',
    })
  })

  test('v desconocido se ignora (cae al Viaje)', () => {
    expect(parseHash('#g=abc123&v=otra')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('add=1 marca la intención de añadir momento (asistente clásico)', () => {
    expect(parseHash('#g=abc123&v=clasico&add=1')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'clasico',
      groupAdd: true,
    })
  })

  test('add=recuerdo marca el flujo ligero "Añadir recuerdo"', () => {
    expect(parseHash('#g=abc123&add=recuerdo')).toEqual({
      view: 'home',
      group: 'abc123',
      groupAddMoment: true,
    })
  })

  test('add=reto marca el flujo inmersivo de crear reto', () => {
    expect(parseHash('#g=abc123&add=reto')).toEqual({
      view: 'home',
      group: 'abc123',
      groupAddChallenge: true,
    })
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

describe('classicGroupHash / addMomentHash', () => {
  test('classicGroupHash apunta a la vista clásica', () => {
    expect(classicGroupHash('abc123')).toBe('#g=abc123&v=clasico')
    // Y parseHash lo reconoce como tal (ida y vuelta).
    expect(parseHash(classicGroupHash('abc123')).groupView).toBe('clasico')
  })

  test('addMomentHash abre el flujo ligero "Añadir recuerdo"', () => {
    expect(addMomentHash('abc123')).toBe('#g=abc123&add=recuerdo')
    const r = parseHash(addMomentHash('abc123'))
    expect(r.group).toBe('abc123')
    expect(r.groupAddMoment).toBe(true)
  })

  test('addChallengeHash abre el flujo inmersivo de crear reto', () => {
    expect(addChallengeHash('abc123')).toBe('#g=abc123&add=reto')
    const r = parseHash(addChallengeHash('abc123'))
    expect(r.group).toBe('abc123')
    expect(r.groupAddChallenge).toBe(true)
  })
})
