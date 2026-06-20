// ¿Mostrar el paso de perfil del primer login? (cuentas-y-home.md §2.2).
//
// El trigger `handle_new_user` crea el perfil con el display_name del magic link
// si vino, o VACÍO si no (migración 0005). Como en el login no mandamos nombre
// (lo pedimos al volver), el primer perfil queda con display_name vacío.
// Mostramos el paso de perfil cuando NO hay nombre elegido (perfil ausente o
// display_name vacío). En cuanto el usuario guarda CUALQUIER nombre, deja de
// pedirse.
//
// IMPORTANTE: no comparamos con un "provisional derivado del email" — eso dejaba
// atrapado a quien su nombre coincidía con el trozo antes de la "@" (p.ej.
// "iker" en iker@…): guardaba el nombre, seguía pareciendo provisional y se
// volvía a pedir en bucle.

import type { Profile } from '../../lib/database.types'

/** true si hay que mostrar el paso de perfil: sin perfil o sin nombre elegido. */
export function needsProfileStep(profile: Profile | null): boolean {
  if (!profile) return true
  return !profile.display_name?.trim()
}
