// Guard puro para #647: si es seguro auto-aplicar una actualización de PWA
// pendiente estando en esta ruta (hash), sin arriesgarse a tirar un formulario
// a medias o cortar una partida en curso.
//
// Contexto (#555 → #633 → #647): #555 dejó el SW nuevo en espera hasta
// aplicarlo explícitamente, y aplica solo (silencioso) al ocultar la pestaña
// (`visibilitychange`) — la idea es que nadie note la recarga. Pero hoy, con
// la cadencia de deploys, casi siempre hay una actualización pendiente, así
// que CADA vuelta al navegador recarga. Si el usuario salió a mitad de un
// FORMULARIO (crear reto/momento, editar perfil…) y vuelve, esa recarga se lo
// lleva por delante. Este helper acota el auto-apply a rutas donde no hay
// nada que perder.
//
// SEGURAS (no hay edición ni partida en juego):
//  - home:             '' o '#'
//  - viaje (diario):   '#g=<code>'               (sin `add=`, sin `c=`)
//  - viaje (marcador): '#g=<code>&v=marcador'     (o `v=fotos`, o el legado `v=clasico`)
//
// NO SEGURAS (puede haber un formulario a medias o una partida en curso):
//  - cualquier hash con `add=` — creando reto/momento: `&add=recuerdo`, `&add=reto`,
//    o el asistente clásico `&add=1`
//  - '#nuevo'  — crear viaje
//  - '#perfil' — editar perfil / cerrar sesión
//  - '#admin'  — puede haber edición
//  - '#g=…&c=…' — jugando un reto: `c=` es la partida en curso, no seguro cortarla
//
// Por defecto NIEGA (`false`) ante cualquier hash no reconocido: preferimos
// dejar una actualización sin aplicar de más a arriesgarnos a cortar algo que
// no conocemos.
export function isSafeUpdateRoute(hash: string): boolean {
  const raw = (hash.startsWith('#') ? hash.slice(1) : hash).trim()

  if (raw === '') return true // home: '', '#'

  if (raw === 'nuevo' || raw === 'perfil' || raw === 'admin') return false

  const params = new URLSearchParams(raw)

  // Cualquier hash sin `g` es una ruta que no reconocemos como "viaje": por
  // defecto, no seguro (incluye hashes atómicos desconocidos y basura).
  if (!params.has('g')) return false

  if (params.has('add')) return false // creando reto/momento
  if (params.has('c')) return false // jugando un reto

  return true // viaje: diario (sin `v`) o marcador (`v=marcador`/`fotos`/`clasico`)
}
