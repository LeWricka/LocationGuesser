// Avatares de animal: un emoji GRANDE sobre un fondo de color con buen
// contraste. No se suben fotos; cada usuario tiene un avatar al instante,
// derivado de su id de forma determinista (sin escribir en BD). El usuario
// puede elegir otro animal desde el perfil; se guarda como `emoji:<char>` en
// `profiles.avatar_url`. El fondo se deriva del propio ANIMAL (del carácter del
// emoji), no del id: así cada animal tiene su color y el set se ve variado en
// el selector. El animal por defecto sí sale del id (avatar estable por user).

/** ~90 emojis de animales para el set de avatares (todos únicos). */
export const ANIMAL_EMOJIS: readonly string[] = [
  '🦊',
  '🐼',
  '🐧',
  '🦉',
  '🐢',
  '🐙',
  '🦁',
  '🐯',
  '🐸',
  '🐵',
  '🐨',
  '🐰',
  '🦝',
  '🦦',
  '🦥',
  '🦡',
  '🐺',
  '🐗',
  '🦌',
  '🦄',
  '🐝',
  '🦋',
  '🐞',
  '🐳',
  '🐬',
  '🦈',
  '🐊',
  '🦓',
  '🦒',
  '🦔',
  '🐱',
  '🐶',
  '🦅',
  '🦜',
  '🐹',
  '🐷',
  '🐮',
  '🐭',
  '🐻',
  '🐻‍❄️',
  '🐔',
  '🐤',
  '🐥',
  '🦆',
  '🦢',
  '🦩',
  '🦚',
  '🦃',
  '🕊️',
  '🦇',
  '🐴',
  '🦛',
  '🦏',
  '🐘',
  '🐫',
  '🐪',
  '🦙',
  '🐑',
  '🐐',
  '🐖',
  '🦬',
  '🐃',
  '🐂',
  '🐄',
  '🐎',
  '🦣',
  '🦘',
  '🐿️',
  '🦫',
  '🐀',
  '🐁',
  '🐇',
  '🐈',
  '🐈‍⬛',
  '🐕',
  '🦮',
  '🐩',
  '🐅',
  '🐆',
  '🦧',
  '🦍',
  '🐒',
  '🦎',
  '🐍',
  '🐉',
  '🐲',
  '🦕',
  '🦖',
  '🐡',
  '🐠',
  '🐟',
  '🦐',
  '🦞',
  '🦀',
  '🦑',
  '🐚',
  '🐌',
  '🐛',
  '🐜',
  '🦗',
  '🕷️',
  '🦂',
] as const

/** Fondo del avatar: degradado sólido (sin filtros) que contrasta con el emoji. */
export interface AvatarBg {
  /** CSS `background` listo para aplicar (gradiente sólido). */
  background: string
}

// Paleta de fondos sólidos elegidos para que el animal resalte: tonos medios
// (ni muy claros ni muy oscuros) y saturados, de forma que el emoji —reforzado
// con sombra y anillo claro en el componente— se lea siempre bien encima.
// 24 tonos repartidos por todo el círculo cromático para que, al derivar el
// fondo del propio animal, el set se vea variado y se repitan poco los colores.
export const AVATAR_BACKGROUNDS: readonly AvatarBg[] = [
  { background: 'linear-gradient(135deg, #ff8a5b 0%, #ff5e7e 100%)' },
  { background: 'linear-gradient(135deg, #2bc0e4 0%, #1a82c9 100%)' },
  { background: 'linear-gradient(135deg, #45c9b0 0%, #2a8f8f 100%)' },
  { background: 'linear-gradient(135deg, #a06bff 0%, #6b4bd6 100%)' },
  { background: 'linear-gradient(135deg, #ffb24d 0%, #f0603c 100%)' },
  { background: 'linear-gradient(135deg, #5b8def 0%, #3a5fd9 100%)' },
  { background: 'linear-gradient(135deg, #f266ab 0%, #c43d8b 100%)' },
  { background: 'linear-gradient(135deg, #3fbf72 0%, #1f8f57 100%)' },
  { background: 'linear-gradient(135deg, #f7585b 0%, #c4303f 100%)' },
  { background: 'linear-gradient(135deg, #00b4a0 0%, #007b8a 100%)' },
  { background: 'linear-gradient(135deg, #ff7a59 0%, #e0457e 100%)' },
  { background: 'linear-gradient(135deg, #7c83fd 0%, #5256c9 100%)' },
  { background: 'linear-gradient(135deg, #e6804d 0%, #b54a3a 100%)' },
  { background: 'linear-gradient(135deg, #2fa0b5 0%, #1c6e8c 100%)' },
  { background: 'linear-gradient(135deg, #c065d6 0%, #8a3bb0 100%)' },
  { background: 'linear-gradient(135deg, #4aa96c 0%, #2a7a52 100%)' },
  { background: 'linear-gradient(135deg, #e8a13a 0%, #c46a1f 100%)' },
  { background: 'linear-gradient(135deg, #57b6e0 0%, #2f6fb0 100%)' },
  { background: 'linear-gradient(135deg, #9a6bd0 0%, #5e3aa0 100%)' },
  { background: 'linear-gradient(135deg, #e0556b 0%, #a32f5a 100%)' },
  { background: 'linear-gradient(135deg, #3fa8a0 0%, #246b66 100%)' },
  { background: 'linear-gradient(135deg, #6f9bd6 0%, #46639e 100%)' },
  { background: 'linear-gradient(135deg, #d76fa0 0%, #9e3f78 100%)' },
  { background: 'linear-gradient(135deg, #58a85e 0%, #2f7740 100%)' },
] as const

/** Resultado de resolver un avatar: o un emoji sobre fondo, o una imagen. */
export type ResolvedAvatar =
  | { kind: 'emoji'; emoji: string; bg: AvatarBg }
  | { kind: 'image'; src: string }

const EMOJI_PREFIX = 'emoji:'

// Hash determinista (FNV-1a de 32 bits) sobre el id. Estable entre sesiones y
// navegadores: el mismo id da siempre el mismo animal y fondo por defecto.
function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // Math.imul mantiene la multiplicación FNV en int32 (sin desbordar a float).
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// Fondo derivado del propio ANIMAL (carácter del emoji), no del id: así cada
// animal tiene su color y el selector se ve variado. El prefijo `bg:` evita
// que un hipotético solapamiento con otros usos del hash colisione.
export function bgForEmoji(emoji: string): AvatarBg {
  const idx = hashString(`bg:${emoji}`) % AVATAR_BACKGROUNDS.length
  return AVATAR_BACKGROUNDS[idx]
}

/** Avatar por defecto (emoji + fondo) derivado de forma estable del id. */
export function defaultAvatarFor(userId: string): { emoji: string; bg: AvatarBg } {
  // El ANIMAL sale del id (avatar estable por usuario); el FONDO sale del
  // animal resultante, para que dos animales distintos varíen de color.
  const emoji = ANIMAL_EMOJIS[hashString(userId) % ANIMAL_EMOJIS.length]
  return { emoji, bg: bgForEmoji(emoji) }
}

/**
 * Resuelve qué pintar para un usuario:
 * - `emoji:<char>` → ese animal, con fondo derivado del propio emoji.
 * - URL http(s) → imagen (retrocompatibilidad con avatares antiguos).
 * - null/vacío → avatar por defecto del id (animal del id, fondo del animal).
 */
export function parseAvatar(avatarUrl: string | null | undefined, userId: string): ResolvedAvatar {
  const value = avatarUrl?.trim()
  if (value) {
    if (value.startsWith(EMOJI_PREFIX)) {
      const emoji = value.slice(EMOJI_PREFIX.length)
      if (emoji) return { kind: 'emoji', emoji, bg: bgForEmoji(emoji) }
    } else if (/^https?:\/\//i.test(value)) {
      return { kind: 'image', src: value }
    }
  }
  const fallback = defaultAvatarFor(userId)
  return { kind: 'emoji', emoji: fallback.emoji, bg: fallback.bg }
}

/** Token para guardar en `profiles.avatar_url` cuando se elige un emoji. */
export function avatarToken(emoji: string): string {
  return `${EMOJI_PREFIX}${emoji}`
}
