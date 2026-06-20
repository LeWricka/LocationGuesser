import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Saneamos las env por si llegan corruptas (p.ej. un valor pegado doble o con
// espacios en Vercel). Una URL malformada produce un host inválido →
// ERR_NAME_NOT_RESOLVED y "Failed to fetch" en prod, mientras en local (env
// limpia) funciona. Extraemos la URL de Supabase válida del texto recibido.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const url = /https:\/\/[a-z0-9-]+\.supabase\.co/i.exec(rawUrl)?.[0] ?? rawUrl
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim().split(/\s+/)[0] ?? ''

if (!url || !publishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y rellénalas.',
  )
}

export const supabase = createClient<Database>(url, publishableKey)
