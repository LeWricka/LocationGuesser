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

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Persistir la sesión en localStorage y refrescar el token en background,
    // para que el login del creador sobreviva a recargas. detectSessionInUrl
    // procesa el token del callback de magic link / OAuth al volver al origin.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
