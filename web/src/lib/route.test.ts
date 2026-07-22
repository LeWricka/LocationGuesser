import { describe, test, expect } from 'vitest'
import {
  parseHash,
  groupHash,
  classicGroupHash,
  marcadorGroupHash,
  marcadorGuideGroupHash,
  fotosGroupHash,
  addMomentHash,
  addChallengeHash,
  promoteChallengeHash,
  ownerInviteHash,
  stripOwnerInviteToken,
} from './route'

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

  test('grupo sin v → abre en Diario (sin groupView)', () => {
    // Por defecto el viaje abre en "Diario": parseHash no marca groupView.
    expect(parseHash('#g=abc123')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('v=marcador → arranca en la pestaña Marcador', () => {
    expect(parseHash('#g=abc123&v=marcador')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'marcador',
    })
  })

  test('v=clasico (legado) → arranca también en la pestaña Marcador', () => {
    // Los enlaces viejos a la GroupPage clásica no se rompen: aterrizan en Marcador.
    expect(parseHash('#g=abc123&v=clasico')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'marcador',
    })
  })

  test('v=fotos → arranca en la pestaña Fotos (issue #645)', () => {
    expect(parseHash('#g=abc123&v=fotos')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'fotos',
    })
  })

  test('v desconocido se ignora (cae a Diario)', () => {
    expect(parseHash('#g=abc123&v=otra')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('guide=marcador junto a v=marcador pide el coach-mark de entrada (issue #886)', () => {
    expect(parseHash('#g=abc123&v=marcador&guide=marcador')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'marcador',
      groupGuide: 'marcador',
    })
  })

  test('guide=marcador sin v=marcador se ignora (solo tiene sentido en el Marcador)', () => {
    expect(parseHash('#g=abc123&guide=marcador')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('add=1 marca la intención de añadir momento (asistente clásico)', () => {
    expect(parseHash('#g=abc123&v=marcador&add=1')).toEqual({
      view: 'home',
      group: 'abc123',
      groupView: 'marcador',
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

  test('add=reto&from=<id> marca el reto que nace de un recuerdo', () => {
    expect(parseHash('#g=abc123&add=reto&from=m-1')).toEqual({
      view: 'home',
      group: 'abc123',
      groupAddChallenge: true,
      groupChallengeFrom: 'm-1',
    })
  })

  test('from sin add=reto se ignora (solo aplica al crear reto)', () => {
    expect(parseHash('#g=abc123&from=m-1')).toEqual({ view: 'home', group: 'abc123' })
  })

  test('adm=<token> marca el enlace de co-dueño (issue #707)', () => {
    expect(parseHash('#g=abc123&adm=tok-1')).toEqual({
      view: 'home',
      group: 'abc123',
      ownerInviteToken: 'tok-1',
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

describe('marcadorGroupHash / classicGroupHash / addMomentHash', () => {
  test('marcadorGroupHash apunta a la pestaña Marcador', () => {
    expect(marcadorGroupHash('abc123')).toBe('#g=abc123&v=marcador')
    // Y parseHash lo reconoce (ida y vuelta).
    expect(parseHash(marcadorGroupHash('abc123')).groupView).toBe('marcador')
  })

  test('marcadorGuideGroupHash pide además el coach-mark de entrada (issue #886)', () => {
    expect(marcadorGuideGroupHash('abc123')).toBe('#g=abc123&v=marcador&guide=marcador')
    // Ida y vuelta: parseHash reconoce ambos flags.
    const r = parseHash(marcadorGuideGroupHash('abc123'))
    expect(r.groupView).toBe('marcador')
    expect(r.groupGuide).toBe('marcador')
  })

  test('classicGroupHash (legado) sigue aterrizando en Marcador', () => {
    expect(classicGroupHash('abc123')).toBe('#g=abc123&v=clasico')
    // El enlace viejo se mapea a la pestaña Marcador (compatibilidad).
    expect(parseHash(classicGroupHash('abc123')).groupView).toBe('marcador')
  })

  test('fotosGroupHash apunta a la pestaña Fotos (issue #645)', () => {
    expect(fotosGroupHash('abc123')).toBe('#g=abc123&v=fotos')
    expect(parseHash(fotosGroupHash('abc123')).groupView).toBe('fotos')
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

  test('addChallengeHash con momento de origen añade &from', () => {
    expect(addChallengeHash('abc123', 'm-1')).toBe('#g=abc123&add=reto&from=m-1')
    const r = parseHash(addChallengeHash('abc123', 'm-1'))
    expect(r.groupAddChallenge).toBe(true)
    expect(r.groupChallengeFrom).toBe('m-1')
  })

  test('promoteChallengeHash abre el asistente en modo promoción (issue #723)', () => {
    expect(promoteChallengeHash('abc123', 'm-1')).toBe('#g=abc123&add=reto&promote=m-1')
    const r = parseHash(promoteChallengeHash('abc123', 'm-1'))
    expect(r.group).toBe('abc123')
    expect(r.groupAddChallenge).toBe(true)
    expect(r.groupChallengePromote).toBe('m-1')
    expect(r.groupChallengeFrom).toBeUndefined()
  })

  test('si coexisten promote y from, manda promote (no se duplica el recuerdo)', () => {
    const r = parseHash('#g=abc123&add=reto&promote=m-1&from=m-2')
    expect(r.groupChallengePromote).toBe('m-1')
    expect(r.groupChallengeFrom).toBeUndefined()
  })
})

describe('ownerInviteHash / stripOwnerInviteToken', () => {
  test('ownerInviteHash construye el enlace de co-dueño', () => {
    expect(ownerInviteHash('abc123', 'tok-1')).toBe('#g=abc123&adm=tok-1')
    const r = parseHash(ownerInviteHash('abc123', 'tok-1'))
    expect(r.group).toBe('abc123')
    expect(r.ownerInviteToken).toBe('tok-1')
  })

  test('stripOwnerInviteToken quita adm y conserva el resto', () => {
    expect(stripOwnerInviteToken('#g=abc123&adm=tok-1&add=reto')).toBe('#g=abc123&add=reto')
  })

  test('stripOwnerInviteToken es no-op si no hay adm', () => {
    expect(stripOwnerInviteToken('#g=abc123&add=reto')).toBe('#g=abc123&add=reto')
  })

  test('stripOwnerInviteToken añade # si el hash no lo trae', () => {
    expect(stripOwnerInviteToken('g=abc123')).toBe('#g=abc123')
  })
})
