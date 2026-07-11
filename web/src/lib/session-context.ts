// Contexto de sesión, separado del provider para no mezclar en un mismo fichero
// exports de componente y de no-componente (regla react-refresh/only-export-components).
// El AuthProvider que rellena este contexto vive en session.tsx.

import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from './database.types'

export interface SessionState {
  /** Sesión de Supabase Auth, o null si no hay login. */
  session: Session | null
  /** Usuario autenticado (`user.id` = uuid de created_by/user_id), o null. */
  user: User | null
  /** Perfil público (display_name, avatar). null mientras carga o si no hay sesión. */
  profile: Profile | null
  /** true durante el arranque (resolviendo la sesión persistida) o al recargar el perfil. */
  loading: boolean
  /**
   * ¿Cuenta PERMANENTE con email VALIDADO? (issue #438). Gatea "crear viaje" en la
   * UI: un anónimo con email pendiente ve/juega/se une, pero NO crea hasta validar.
   * Solo para la UI; la seguridad real la impone la RLS `groups_insert_owner`.
   */
  verified: boolean
  /**
   * ¿Sesión ANÓNIMA (issue #758)? El receptor que abre un enlace de viaje/reto
   * entra así, sin dar ningún dato: puede ver/jugar/unirse igual que cualquier
   * miembro (RLS `to authenticated` los cubre tras el auto-join), pero NO puede
   * crear (RLS `groups_insert_owner`, migración 0032) ni aparece en "Miembros"
   * hasta que juega o guarda su cuenta. `verified` (arriba) ya cubre "cuenta
   * permanente con email"; este flag es el complementario "sigue siendo un
   * invitado de paso".
   */
  isAnonymous: boolean
  /** Vuelve a leer el perfil de BD (tras editar display_name/avatar en el onboarding o la home). */
  refreshProfile: () => Promise<void>
}

// Contexto sin provider = error explícito: ayuda a detectar montajes fuera del árbol.
export const SessionContext = createContext<SessionState | null>(null)

/** Acceso a la sesión/usuario/perfil. Debe usarse dentro de <AuthProvider>. */
export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <AuthProvider>')
  return ctx
}
