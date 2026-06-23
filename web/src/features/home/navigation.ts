// Navegación de la home por HASH. La home NO posee el router (lo concentra la
// pieza #4 en App.tsx/lib/route.ts): para movernos, solo escribimos
// `location.hash` con las convenciones que #4 enruta. Centralizado aquí para que
// los destinos sean explícitos y testeables, y para documentar el contrato:
//
//   #g=<groupId>                → página del grupo
//   #g=<groupId>&c=<challengeId> → jugar un reto concreto (mismo formato que parseHash)
//   #nuevo                       → crear grupo (la pieza #4 enruta este hash)
//   #perfil                      → perfil del usuario (idem)
//
// `#g=` y `#g=&c=` ya los parsea `lib/route.parseHash`; `#nuevo` y `#perfil` son
// rutas nuevas que la pieza #4 debe añadir al router.

export function gotoGroup(groupId: string): void {
  window.location.hash = `g=${encodeURIComponent(groupId)}`
}

export function gotoChallenge(groupId: string, challengeId: string): void {
  window.location.hash = `g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(challengeId)}`
}

export function gotoCreateGroup(): void {
  window.location.hash = 'nuevo'
}

export function gotoProfile(): void {
  window.location.hash = 'perfil'
}

// Extrae el código de grupo de lo que el usuario pegue en "Unirme con un código":
// acepta un enlace completo (…#g=<code>&c=…) o el código a secas. Devuelve null
// si no hay nada usable. El auto-join al entrar por #g=<code> (App.tsx) hace el
// resto: añade al usuario al grupo de forma idempotente.
export function parseGroupCode(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Si trae el parámetro g= (enlace pegado), nos quedamos con ese valor.
  const match = raw.match(/[#?&]?g=([^&\s]+)/)
  if (match) return decodeURIComponent(match[1])

  // Si no, asumimos que es el código a secas; descartamos cualquier espacio.
  return raw.split(/\s/)[0] || null
}

// Navega al grupo a partir de un código/enlace pegado. Devuelve true si pudo
// extraer un código (y navegó), false si la entrada no servía.
export function joinByCode(input: string): boolean {
  const code = parseGroupCode(input)
  if (!code) return false
  gotoGroup(code)
  return true
}
