// Seed idempotente del usuario de test para los E2E autenticados (#140).
//
// Crea (o confirma que existe) un usuario con email+password ya confirmado, usando
// la SERVICE ROLE KEY de Supabase (admin). Pensado para ejecutarse en local una
// vez, o en CI antes de la suite autenticada.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=... VITE_SUPABASE_URL=... \
//   E2E_USER_EMAIL=e2e@example.com E2E_USER_PASSWORD=... \
//   npm run e2e:seed-user
//
// SEGURIDAD: SUPABASE_SERVICE_ROLE_KEY es SECRETA (omite RLS). NUNCA la commitees
// ni la pongas en .env.local versionado; pásala por el entorno o por secrets de CI.

import { createClient } from '@supabase/supabase-js'

const url = (process.env.VITE_SUPABASE_URL ?? '').trim()
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (!url) fail('Falta VITE_SUPABASE_URL en el entorno.')
if (!serviceRoleKey) fail('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno (clave secreta admin).')
if (!email || !password) fail('Faltan E2E_USER_EMAIL y/o E2E_USER_PASSWORD en el entorno.')

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Busca un usuario por email paginando la lista de admin (la API no expone un
// get-by-email directo). Suficiente para un proyecto con pocos usuarios de test.
async function findUserByEmail(targetEmail) {
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase())
    if (match) return match
    if (data.users.length < perPage) return null
  }
}

async function main() {
  const existing = await findUserByEmail(email)

  if (existing) {
    // Idempotente: aseguramos password y email confirmado por si el usuario ya
    // estaba pero con otra password/sin confirmar.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) fail(`No se pudo actualizar el usuario de test: ${error.message}`)
    console.log(`✓ Usuario de test ya existía y quedó listo: ${email} (${existing.id})`)
    return
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) fail(`No se pudo crear el usuario de test: ${error.message}`)
  console.log(`✓ Usuario de test creado: ${email} (${data.user?.id})`)
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
