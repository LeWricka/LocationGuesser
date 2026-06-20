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
