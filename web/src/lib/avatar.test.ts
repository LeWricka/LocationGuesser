import { describe, test, expect } from 'vitest'
import {
  ANIMAL_EMOJIS,
  ANIMAL_SVGS,
  AVATAR_BACKGROUNDS,
  avatarToken,
  bgForEmoji,
  canonicalEmoji,
  defaultAvatarFor,
  parseAvatar,
  svgForEmoji,
} from './avatar'

describe('set de animales', () => {
  test('es exactamente el set canónico de 8 animales con SVG, todos únicos', () => {
    expect(ANIMAL_EMOJIS.length).toBe(8)
    expect(new Set(ANIMAL_EMOJIS).size).toBe(ANIMAL_EMOJIS.length)
  })

  test('todos los animales del set tienen dibujo SVG', () => {
    for (const emoji of ANIMAL_EMOJIS) {
      expect(svgForEmoji(emoji)).not.toBeNull()
    }
    // Y no hay SVGs huérfanos fuera del set ofrecido.
    expect(new Set(Object.keys(ANIMAL_SVGS))).toEqual(new Set(ANIMAL_EMOJIS))
  })
})

describe('canonicalEmoji', () => {
  test('un animal del set se devuelve tal cual', () => {
    for (const emoji of ANIMAL_EMOJIS) {
      expect(canonicalEmoji(emoji)).toBe(emoji)
    }
  })

  test('un emoji antiguo (fuera del set) se proyecta a uno de los 8, estable', () => {
    // El panda ya no está en el set de 8; debe caer en uno de los 8, siempre el
    // mismo (determinista) → un perfil viejo nunca ve un emoji retirado.
    const a = canonicalEmoji('🐼')
    const b = canonicalEmoji('🐼')
    expect(a).toBe(b)
    expect(ANIMAL_EMOJIS).toContain(a)
  })
})

describe('bgForEmoji', () => {
  test('es determinista por emoji y pertenece al set', () => {
    const a = bgForEmoji('🦊')
    const b = bgForEmoji('🦊')
    expect(a).toEqual(b)
    expect(AVATAR_BACKGROUNDS).toContainEqual(a)
  })

  test('dos animales concretos distintos dan fondos distintos', () => {
    // No es garantía universal (puede haber colisiones), pero el oso y el zorro
    // —ambos del set de 8— deben verse con colores distintos.
    expect(bgForEmoji('🐻')).not.toEqual(bgForEmoji('🦊'))
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
  test('token del set → ese animal con fondo derivado del emoji', () => {
    const result = parseAvatar('emoji:🦊', 'user-1')
    expect(result).toEqual({ kind: 'emoji', emoji: '🦊', bg: bgForEmoji('🦊') })
  })

  test('token antiguo (fuera del set) → animal canónico, estable y dentro de los 8', () => {
    const result = parseAvatar('emoji:🐼', 'user-1')
    expect(result.kind).toBe('emoji')
    if (result.kind === 'emoji') {
      expect(result.emoji).toBe(canonicalEmoji('🐼'))
      expect(ANIMAL_EMOJIS).toContain(result.emoji)
      expect(result.bg).toEqual(bgForEmoji(result.emoji))
    }
  })

  test('el resultado del token NO depende del id (mismo token → mismo animal)', () => {
    const a = parseAvatar('emoji:🐼', 'user-1')
    const b = parseAvatar('emoji:🐼', 'user-2')
    expect(a).toEqual(b)
  })

  test('URL http → imagen (retrocompat con fotos subidas)', () => {
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
