import type { SceneMedium } from '../features/play/sceneMedium'

// Dificultad de un reto = cuánta información ven los participantes. Es la
// combinatoria de los dos medios que el play ya soporta (foto y/o Street View):
//
//   Fácil   → foto + Street View  (más pistas: imagen + panorama explorable)
//   Medio   → solo Street View    (exploran el panorama, sin foto)
//   Difícil → solo foto           (una foto y a ojo, sin explorar)
//
// NO hay cambio de modelo de datos: la dificultad se DERIVA de qué medios tiene
// el reto (sv_pano_id y/o image_path). Esta lib es la fuente de verdad de esa
// derivación y de la regla dura "un reto debe mostrar al menos foto o SV".

export type Difficulty = 'facil' | 'medio' | 'dificil'

// Etiqueta de presentación de cada dificultad. Sin emoji de estado: si en algún
// momento se pinta en la UI, el punto de color (verde/ámbar/rojo) lo aporta un
// dot por token, no un emoji en el texto.
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facil: 'Fácil',
  medio: 'Medio',
  dificil: 'Difícil',
}

/** Frase de qué verán los participantes en cada dificultad. */
export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  facil: 'Les das una foto y pueden mirar alrededor en la calle.',
  medio: 'Solo la calle, sin foto.',
  dificil: 'Solo la foto. A ojo, sin poder moverte.',
}

/** Qué medios componen una dificultad (lo que el creador se propone montar). */
export interface DifficultyMedia {
  /** ¿El reto lleva foto? */
  hasPhoto: boolean
  /** ¿El reto lleva Street View (panorama)? */
  hasStreetView: boolean
}

export const DIFFICULTY_MEDIA: Record<Difficulty, DifficultyMedia> = {
  facil: { hasPhoto: true, hasStreetView: true },
  medio: { hasPhoto: false, hasStreetView: true },
  dificil: { hasPhoto: true, hasStreetView: false },
}

/**
 * Deriva la dificultad REAL a partir de los medios que de verdad tiene el reto.
 * Refleja el estado actual y degrada con coherencia: si Fácil pierde el Street
 * View (no hay cobertura o el creador lo quita), pasa a Difícil; si pierde la
 * foto, a Medio. `null` = combinación inválida (sin foto ni SV): la regla dura
 * `medium != 'none'` la prohíbe (ver `isValidMedia`).
 */
export function difficultyFromMedia({
  hasPhoto,
  hasStreetView,
}: DifficultyMedia): Difficulty | null {
  if (hasPhoto && hasStreetView) return 'facil'
  if (hasStreetView) return 'medio'
  if (hasPhoto) return 'dificil'
  return null
}

/**
 * Regla dura: un reto debe mostrar AL MENOS foto o Street View. Sin ninguno de
 * los dos el `sceneMedium` del play sería 'none' (nada que enseñar). Equivale a
 * `difficultyFromMedia(...) != null`, expresado como predicado para validar
 * antes de guardar.
 */
export function isValidMedia(media: DifficultyMedia): boolean {
  return difficultyFromMedia(media) !== null
}

/**
 * Traduce los medios a `SceneMedium` (lo que el play renderiza), aplicando la
 * MISMA prioridad que `sceneMedium`: Street View manda sobre la foto cuando hay
 * ambos. Útil para la previa "así lo verán los participantes" sin pasar por la
 * fila de BD.
 */
export function sceneMediumFromMedia({ hasPhoto, hasStreetView }: DifficultyMedia): SceneMedium {
  if (hasStreetView) return 'streetview'
  if (hasPhoto) return 'photo'
  return 'none'
}
