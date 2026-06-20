import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// .trim() por higiene (espacios accidentales al pegar la env). El valor debe
// ser limpio en origen, p.ej. VITE_SUPABASE_URL = https://<ref>.supabase.co
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

if (!url || !publishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y rellénalas.',
  )
}

// Config de auth necesaria para el magic link (cuentas-y-home.md §2):
// - persistSession: la fricción del login es de una sola vez; la sesión vive
//   en localStorage y el 2º acceso es directo.
// - autoRefreshToken: refresca el token en segundo plano para no caducar.
// - detectSessionInUrl: al volver del email, Supabase lee el token del hash de
//   la URL y crea la sesión sin que el cliente haga nada.
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
