// Enrutado por hash. El grupo ("el viaje") y el reto activo viajan en el
// fragmento de la URL (`#g=<code>&c=<uuid>`) para poder compartirse por chat
// sin backend. El parser es tolerante: acepta claves en cualquier orden y
// hashes parciales (solo grupo, solo reto, o vacíos).
//
// Con cuentas + home (cuentas-y-home.md §3.4) aparecen dos rutas "de app" que no
// son grupos: `#nuevo` (crear grupo) y `#perfil` (editar perfil / cerrar sesión).
// Se modelan como vistas atómicas: si el hash es exactamente esa palabra, manda;
// el deep link `#g`/`#c` sigue funcionando igual que antes.

export type View = 'home' | 'new' | 'profile'

export interface Route {
  /** Vista de app cuando hay sesión y no es un deep link de grupo/reto. */
  view: View
  group?: string
  challenge?: string
  /**
   * Sub-vista dentro de un grupo (`#g=…&v=…`). Por defecto el grupo abre la
   * pantalla "Viaje" (diario visual); `v=clasico` es el escape a la GroupPage de
   * siempre (marcador, ajustes, fin de temporada). No afecta a los deep links de
   * reto (`#c`), que siguen yendo directos a jugar.
   */
  groupView?: 'clasico'
  /**
   * Intención de abrir directamente "Añadir momento" al entrar a la GroupPage
   * clásica (`#g=…&v=clasico&add=1`). Lo usa el FAB de la pantalla "Viaje" para
   * reusar el flujo de creación existente sin duplicarlo.
   */
  groupAdd?: boolean
}

// Hashes atómicos (sin pares clave=valor) que mapean a vistas de la app.
const VIEW_BY_HASH: Record<string, View> = {
  nuevo: 'new',
  perfil: 'profile',
}

/**
 * Parsea el hash de la URL a `{ view, group?, challenge? }`.
 * Acepta el hash con o sin `#` inicial. Por defecto usa `location.hash`.
 *
 * Prioridad: un deep link de grupo/reto (`#g`/`#c`) siempre gana sobre las vistas
 * de app; `#nuevo`/`#perfil` solo aplican cuando el hash es exactamente esa
 * palabra. Cualquier otro hash (o vacío) cae a la home.
 */
export function parseHash(hash: string = window.location.hash): Route {
  // Quitamos el `#` inicial si viene.
  const raw = hash.startsWith('#') ? hash.slice(1) : hash

  // Vista atómica: el hash es exactamente `nuevo`/`perfil` (sin `=`). No usamos
  // URLSearchParams aquí porque `nuevo` sin `=` no es un par clave=valor.
  const view = VIEW_BY_HASH[raw.trim()]
  if (view) return { view }

  // Pares clave=valor: usamos URLSearchParams para no reinventar el parseo
  // (decodifica %xx y respeta el orden libre).
  const params = new URLSearchParams(raw)
  const route: Route = { view: 'home' }

  const group = params.get('g')?.trim()
  if (group) route.group = group

  const challenge = params.get('c')?.trim()
  if (challenge) route.challenge = challenge

  // Sub-vista del grupo: solo reconocemos `clasico` (la GroupPage de siempre);
  // cualquier otro valor se ignora y el grupo abre la pantalla "Viaje".
  if (params.get('v')?.trim() === 'clasico') route.groupView = 'clasico'

  // Intención de abrir "Añadir momento" directo (solo junto a la vista clásica).
  if (params.get('add')?.trim() === '1') route.groupAdd = true

  return route
}

/** Construye el hash de un destino de grupo/reto, para `location.hash = …`. */
export function groupHash(groupId: string, challengeId?: string): string {
  const params = new URLSearchParams({ g: groupId })
  if (challengeId) params.set('c', challengeId)
  return `#${params.toString()}`
}

/** Hash de la GroupPage clásica de un grupo (`#g=…&v=clasico`). */
export function classicGroupHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&v=clasico`
}

/** Hash de la GroupPage clásica abriendo "Añadir momento" (`…&v=clasico&add=1`). */
export function addMomentHash(groupId: string): string {
  return `${classicGroupHash(groupId)}&add=1`
}
