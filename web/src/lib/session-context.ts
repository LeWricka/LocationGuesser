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
