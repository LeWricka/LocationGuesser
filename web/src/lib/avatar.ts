// Avatares de animal: un dibujo de LÍNEA (SVG, estilo Atelier/Pizarra) sobre un
// tint claro. No se suben fotos por defecto; cada usuario tiene un avatar al
// instante, derivado de su id de forma determinista (sin escribir en BD). El
// usuario puede elegir otro animal desde el perfil; se guarda como `emoji:<char>`
// en `profiles.avatar_url` (la CLAVE sigue siendo el emoji → el MODELO de datos
// no cambia). El set por defecto son SOLO los 8 animales con dibujo SVG, para que
// el look sea consistente (nunca se mezcla SVG con emoji). El animal por defecto
// sale del id (avatar estable por usuario); el fondo se deriva del propio animal.

// El set canónico se define más abajo como las CLAVES de `ANIMAL_SVGS` (los 8
// animales con dibujo). `ANIMAL_EMOJIS` apunta a ese mismo set para que el
// selector, `defaultAvatarFor` y `parseAvatar` ofrezcan/rendericen solo esos 8.

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

// Avatares-animal en SVG de línea (estilo Atelier/Pizarra): el set por defecto
// son EXACTAMENTE estos 8 animales dibujados a trazo. La CLAVE sigue siendo el
// emoji (token `emoji:<char>`), así el MODELO de datos no cambia; lo que cambia
// es que solo se ofrecen/renderizan estos 8 (nunca emoji suelto). El componente
// Avatar siempre pinta el SVG para los avatares por defecto. El contenido es el
// INTERIOR del <svg viewBox="0 0 24 24">; el componente lo envuelve.
export const ANIMAL_SVG_VIEWBOX = '0 0 24 24'

export const ANIMAL_SVGS: Readonly<Record<string, string>> = {
  // Zorro
  '🦊':
    '<path d="M4 6l5 4 3-1 3 1 5-4-1 7c0 4-3 7-7 7s-7-3-7-7L4 6Z"/>' +
    '<circle cx="9.5" cy="12" r=".9" fill="currentColor"/>' +
    '<circle cx="14.5" cy="12" r=".9" fill="currentColor"/>',
  // Búho
  '🦉':
    '<circle cx="9" cy="10" r="3"/><circle cx="15" cy="10" r="3"/>' +
    '<path d="M6 14c0 4 2.7 6 6 6s6-2 6-6"/><path d="M5 6l3 2M19 6l-3 2"/>',
  // Ballena
  '🐳':
    '<path d="M4 12c0-3 3-5 7-5s9 2 9 7c0 0-3-1-5-1-1 3-5 4-8 2-2-1-3-2-3-4Z"/>' +
    '<path d="M11 4c1 1 1 2 0 3"/>',
  // Gato
  '🐱':
    '<path d="M5 5l3 4M19 5l-3 4"/>' +
    '<path d="M6 9c0-2 2-3 6-3s6 1 6 3v5c0 3-3 5-6 5s-6-2-6-5V9Z"/>' +
    '<circle cx="10" cy="12" r=".8" fill="currentColor"/>' +
    '<circle cx="14" cy="12" r=".8" fill="currentColor"/>',
  // Conejo
  '🐰':
    '<path d="M9 9C8 6 8 3 10 3s2 4 1 6M15 9c1-3 1-6-1-6s-2 4-1 6"/>' +
    '<circle cx="12" cy="15" r="5"/>',
  // Oso
  '🐻':
    '<circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="7" r="2.4"/>' +
    '<circle cx="12" cy="14" r="6"/>' +
    '<circle cx="10" cy="13" r=".8" fill="currentColor"/>' +
    '<circle cx="14" cy="13" r=".8" fill="currentColor"/>',
  // Pingüino
  '🐧':
    '<path d="M12 3c3 0 5 2.5 5 7v6c0 3-2 5-5 5s-5-2-5-5V10c0-4.5 2-7 5-7Z"/>' +
    '<path d="M10 9c1 1 3 1 4 0"/>',
  // Ciervo
  '🦌':
    '<path d="M7 3l2 4M17 3l-2 4M5 5l2 1M19 5l-2 1"/>' +
    '<path d="M8 9c0-1 2-2 4-2s4 1 4 2v6c0 3-2 5-4 5s-4-2-4-5V9Z"/>',
}

/**
 * Set canónico de avatares por defecto: los 8 animales con dibujo SVG, en el
 * orden de la maqueta. Es el ÚNICO set que se ofrece en el selector y del que
 * salen los avatares por defecto. Cualquier token antiguo fuera de aquí se mapea
 * de forma estable a uno de estos 8 (ver `parseAvatar`).
 */
export const ANIMAL_EMOJIS: readonly string[] = Object.keys(ANIMAL_SVGS)

/** Alias retrocompatible: el set por defecto ES el set canónico. */
export const DEFAULT_ANIMAL_EMOJIS = ANIMAL_EMOJIS

/** ¿Este emoji tiene un avatar SVG de línea en el set por defecto? */
export function svgForEmoji(emoji: string): string | null {
  return ANIMAL_SVGS[emoji] ?? null
}

/**
 * Mapea cualquier emoji al set canónico de 8: si ya es uno de los 8 lo devuelve
 * tal cual; si es un emoji antiguo (ya retirado del set) lo proyecta de forma
 * DETERMINISTA a uno de los 8 (hash del propio token). Así un perfil viejo con
 * un emoji que ya no existe ve siempre el mismo animal SVG, sin emoji suelto y
 * sin tocar la BD.
 */
export function canonicalEmoji(emoji: string): string {
  if (ANIMAL_SVGS[emoji]) return emoji
  return ANIMAL_EMOJIS[hashString(`legacy:${emoji}`) % ANIMAL_EMOJIS.length]
}

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
 * - `emoji:<char>` → ese animal, normalizado al set canónico de 8 (un token
 *   antiguo fuera del set se proyecta de forma estable a uno de los 8), con
 *   fondo derivado del animal resultante.
 * - URL http(s) → imagen (retrocompatibilidad con fotos de perfil subidas).
 * - null/vacío → avatar por defecto del id (animal del id, fondo del animal).
 */
export function parseAvatar(avatarUrl: string | null | undefined, userId: string): ResolvedAvatar {
  const value = avatarUrl?.trim()
  if (value) {
    if (value.startsWith(EMOJI_PREFIX)) {
      const raw = value.slice(EMOJI_PREFIX.length)
      if (raw) {
        const emoji = canonicalEmoji(raw)
        return { kind: 'emoji', emoji, bg: bgForEmoji(emoji) }
      }
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
