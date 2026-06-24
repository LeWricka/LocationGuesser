import { describe, test, expect } from 'vitest'
import {
  ANIMAL_EMOJIS,
  AVATAR_BACKGROUNDS,
  avatarToken,
  bgForEmoji,
  defaultAvatarFor,
  parseAvatar,
} from './avatar'

describe('set de animales', () => {
  test('tiene ~90 emojis, todos únicos', () => {
    expect(ANIMAL_EMOJIS.length).toBeGreaterThanOrEqual(85)
    expect(new Set(ANIMAL_EMOJIS).size).toBe(ANIMAL_EMOJIS.length)
  })
})

describe('bgForEmoji', () => {
  test('es determinista por emoji y pertenece al set', () => {
    const a = bgForEmoji('🦊')
    const b = bgForEmoji('🦊')
    expect(a).toEqual(b)
    expect(AVATAR_BACKGROUNDS).toContainEqual(a)
  })

  test('emojis distintos tienden a fondos distintos (buena distribución)', () => {
    // El fondo sale del propio animal: sobre todo el set debe usarse buena
    // parte de la paleta (no todos iguales, como pasaba al derivarlo del id).
    const fondos = new Set(ANIMAL_EMOJIS.map((emoji) => bgForEmoji(emoji).background))
    // Con ~102 animales y 24 fondos, esperamos cubrir casi toda la paleta.
    expect(fondos.size).toBeGreaterThanOrEqual(AVATAR_BACKGROUNDS.length - 2)
  })

  test('dos animales concretos distintos dan fondos distintos', () => {
    // No es garantía universal (puede haber colisiones), pero el panda y el
    // zorro deben verse con colores distintos en el selector.
    expect(bgForEmoji('🐼')).not.toEqual(bgForEmoji('🦊'))
  })
})

describe('defaultAvatarFor', () => {
  test('es determinista para el mismo id', () => {
    const a = defaultAvatarFor('user-123')
    const b = defaultAvatarFor('user-123')
    expect(a).toEqual(b)
  })

  test('el emoji y el fondo pertenecen al set', () => {
    const { emoji, bg } = defaultAvatarFor('otro-usuario')
    expect(ANIMAL_EMOJIS).toContain(emoji)
    expect(AVATAR_BACKGROUNDS).toContainEqual(bg)
  })

  test('el fondo se deriva del animal, no del id', () => {
    const { emoji, bg } = defaultAvatarFor('user-123')
    expect(bg).toEqual(bgForEmoji(emoji))
  })

  test('ids distintos pueden dar animales distintos', () => {
    const emojis = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => defaultAvatarFor(id).emoji),
    )
    expect(emojis.size).toBeGreaterThan(1)
  })
})

describe('parseAvatar', () => {
  test('token emoji → ese animal con fondo derivado del emoji', () => {
    const result = parseAvatar('emoji:🦊', 'user-1')
    expect(result).toEqual({ kind: 'emoji', emoji: '🦊', bg: bgForEmoji('🦊') })
  })

  test('el fondo del token NO depende del id (mismo emoji → mismo fondo)', () => {
    const a = parseAvatar('emoji:🐼', 'user-1')
    const b = parseAvatar('emoji:🐼', 'user-2')
    expect(a).toEqual(b)
  })

  test('URL http → imagen (retrocompat)', () => {
    const result = parseAvatar('https://cdn.example.com/a.png', 'user-1')
    expect(result).toEqual({ kind: 'image', src: 'https://cdn.example.com/a.png' })
  })

  test('null → avatar por defecto del id', () => {
    expect(parseAvatar(null, 'user-1')).toEqual({
      kind: 'emoji',
      ...defaultAvatarFor('user-1'),
    })
  })
})

describe('avatarToken', () => {
  test('serializa con prefijo emoji:', () => {
    expect(avatarToken('🐼')).toBe('emoji:🐼')
  })

  test('parseAvatar revierte avatarToken', () => {
    const result = parseAvatar(avatarToken('🐧'), 'u')
    expect(result).toMatchObject({ kind: 'emoji', emoji: '🐧' })
  })
})
