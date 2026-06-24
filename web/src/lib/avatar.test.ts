import { describe, test, expect } from 'vitest'
import {
  ANIMAL_EMOJIS,
  AVATAR_BACKGROUNDS,
  avatarToken,
  defaultAvatarFor,
  parseAvatar,
} from './avatar'

describe('set de animales', () => {
  test('tiene ~90 emojis, todos únicos', () => {
    expect(ANIMAL_EMOJIS.length).toBeGreaterThanOrEqual(85)
    expect(new Set(ANIMAL_EMOJIS).size).toBe(ANIMAL_EMOJIS.length)
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

  test('ids distintos pueden dar animales distintos', () => {
    const emojis = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => defaultAvatarFor(id).emoji),
    )
    expect(emojis.size).toBeGreaterThan(1)
  })
})

describe('parseAvatar', () => {
  test('token emoji → ese animal con fondo estable del id', () => {
    const result = parseAvatar('emoji:🦊', 'user-1')
    expect(result).toEqual({ kind: 'emoji', emoji: '🦊', bg: defaultAvatarFor('user-1').bg })
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
