// AuthProvider FALSO para la galería: rellena el SessionContext REAL con una
// sesión/usuario/perfil sembrados, de modo que `useSession()` funciona igual que
// en producción pero sin login ni red. Se inyecta vía alias de Vite que reemplaza
// `lib/session` SOLO en el entry de galería (ver vite.config.ts). El contexto y el
// hook (`session-context.ts`) son los REALES: solo cambia quién los rellena.

import { useMemo, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { ME, GALLERY_NOW } from './fixtures'
import { SessionContext, type SessionState } from '../lib/session-context'

interface Props {
  children: ReactNode
}

// Usuario mínimo con la forma de @supabase/supabase-js (solo los campos que la app
// lee: id, email). El resto se rellena con valores neutros para cumplir el tipo.
const fakeUser: User = {
  id: ME.id,
  email: 'lewis@ejemplo.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: ME.created_at,
} as User

const fakeSession: Session = {
  access_token: 'gallery-fake-token',
  refresh_token: 'gallery-fake-refresh',
  expires_in: 3600,
  expires_at: Math.floor(GALLERY_NOW.getTime() / 1000) + 3600,
  token_type: 'bearer',
  user: fakeUser,
} as Session

export function AuthProvider({ children }: Props) {
  const value = useMemo<SessionState>(
    () => ({
      session: fakeSession,
      user: fakeUser,
      profile: ME,
      loading: false,
      refreshProfile: async () => {},
    }),
    [],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
