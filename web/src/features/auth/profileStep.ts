// ¿Mostrar el paso de perfil del primer login? (cuentas-y-home.md §2.2).
//
// El trigger `handle_new_user` (migración 0004) SIEMPRE crea un perfil: usa el
// display_name del magic link si vino, o el trozo antes de la "@" del email como
// provisional. Como en el login no mandamos display_name (lo pedimos al volver),
// el primer perfil queda con ese provisional. Detectamos "aún no ha elegido
// nombre" comparando el display_name con el provisional derivado del email: si
// coinciden (o falta el perfil), pedimos el paso de perfil. En cuanto el usuario
// guarda un nombre distinto, deja de pedirse — y en re-logins ya no aparece.

import type { Profile } from '../../lib/database.types'

/** Provisional que pone el trigger: el texto antes de la "@" del email. */
function provisionalName(email: string | undefined): string {
  if (!email) return ''
  return email.split('@')[0] ?? ''
}

/**
 * true si hay que mostrar el paso de perfil: no hay perfil todavía, su
 * display_name está vacío, o sigue siendo el provisional derivado del email.
 */
export function needsProfileStep(profile: Profile | null, email: string | undefined): boolean {
  if (!profile) return true
  const name = profile.display_name?.trim() ?? ''
  if (!name) return true
  return name === provisionalName(email)
}
