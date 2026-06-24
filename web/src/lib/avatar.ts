// Avatares de animal: un emoji GRANDE sobre un fondo de color con buen
// contraste. No se suben fotos; cada usuario tiene un avatar al instante,
// derivado de su id de forma determinista (sin escribir en BD). El usuario
// puede elegir otro animal desde el perfil; se guarda como `emoji:<char>` en
// `profiles.avatar_url`. El fondo siempre se deriva del id (estable aunque
// cambie el animal), así dos personas distintas casi nunca comparten color.

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

// Índice del fondo derivado del id (separado del índice de emoji para que
// elegir otro animal no cambie el color).
function bgFor(userId: string): AvatarBg {
  const idx = hashString(`bg:${userId}`) % AVATAR_BACKGROUNDS.length
  return AVATAR_BACKGROUNDS[idx]
}

/** Avatar por defecto (emoji + fondo) derivado de forma estable del id. */
export function defaultAvatarFor(userId: string): { emoji: string; bg: AvatarBg } {
  const emoji = ANIMAL_EMOJIS[hashString(userId) % ANIMAL_EMOJIS.length]
  return { emoji, bg: bgFor(userId) }
}

/**
 * Resuelve qué pintar para un usuario:
 * - `emoji:<char>` → ese animal, con fondo derivado del id (estable).
 * - URL http(s) → imagen (retrocompatibilidad con avatares antiguos).
 * - null/vacío → avatar por defecto del id.
 */
export function parseAvatar(avatarUrl: string | null | undefined, userId: string): ResolvedAvatar {
  const value = avatarUrl?.trim()
  if (value) {
    if (value.startsWith(EMOJI_PREFIX)) {
      const emoji = value.slice(EMOJI_PREFIX.length)
      if (emoji) return { kind: 'emoji', emoji, bg: bgFor(userId) }
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
