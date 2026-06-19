// Identidad sin login. La identidad estable es el NOMBRE (votos y ranking van
// por nombre); el navegador guarda una identidad global —vale para todos los
// grupos— en localStorage: `client_id` + `name` + `pin_hash`.
//
// Candado blando: el `pin_hash` es público (web sin backend) y un PIN de 4
// dígitos se fuerza fácil. Solo frena el robo casual de nombre entre amigos.
// Seguridad real (Supabase Auth) queda para "next".

const CLIENT_KEY = 'lg.clientId'
const NAME_KEY = 'lg.name'
const PIN_HASH_KEY = 'lg.pinHash'

export interface Identity {
  clientId: string
  name: string
  pinHash: string
}

/** client_id estable del navegador; se genera la primera vez. */
export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

/** Identidad global del navegador, o null si aún no se ha fijado un nombre. */
export function getIdentity(): Identity | null {
  const name = localStorage.getItem(NAME_KEY)
  const pinHash = localStorage.getItem(PIN_HASH_KEY)
  if (!name || !pinHash) return null
  return { clientId: getClientId(), name, pinHash }
}

/** Fija (o actualiza) la identidad global: nombre + pin_hash. Reusa client_id. */
export function setIdentity(name: string, pinHash: string): Identity {
  const clientId = getClientId()
  localStorage.setItem(NAME_KEY, name)
  localStorage.setItem(PIN_HASH_KEY, pinHash)
  return { clientId, name, pinHash }
}

/**
 * Hash hex del PIN con SHA-256. Determinista: el mismo PIN da el mismo hash en
 * cualquier navegador, así reclamar un nombre en otro móvil compara igual.
 */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
