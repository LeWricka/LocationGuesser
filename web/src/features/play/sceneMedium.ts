import type { Challenge } from '../../lib/database.types'

/**
 * Qué se muestra al jugar un reto:
 * - `streetview`: reto nuevo con panorama (tiene `sv_pano_id`).
 * - `photo`: reto legacy sin Street View pero con `image_path`.
 * - `none`: reto sin imagen ni panorama (no debería pasar; degrada con aviso).
 *
 * Street View tiene prioridad sobre la foto para no mostrar spoilers de retos
 * que tuvieran ambas cosas.
 */
export type SceneMedium = 'streetview' | 'photo' | 'none'

export function sceneMedium(challenge: Pick<Challenge, 'sv_pano_id' | 'image_path'>): SceneMedium {
  if (challenge.sv_pano_id != null) return 'streetview'
  if (challenge.image_path != null) return 'photo'
  return 'none'
}
