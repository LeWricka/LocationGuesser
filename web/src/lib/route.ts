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
   * Sección inicial dentro del viaje (`#g=…&v=…`). Por defecto el viaje abre en
   * "Diario"; `v=marcador` (y el legado `v=clasico`) hace que el viaje arranque en
   * la pestaña "Marcador". Antes el marcador era una pantalla aparte (GroupPage);
   * ahora es la segunda sección del propio viaje, así que la ruta solo decide en
   * qué pestaña aterrizar. No afecta a los deep links de reto (`#c`).
   */
  groupView?: 'marcador'
  /**
   * Intención de abrir directamente "Añadir momento" al entrar al viaje
   * (`#g=…&v=marcador&add=1`). Lo usa el asistente de reto clásico.
   */
  groupAdd?: boolean
  /**
   * Intención de abrir el flujo ligero "Añadir recuerdo" del viaje (`#g=…&add=recuerdo`).
   * Es la entrada del FAB "＋" de la pantalla "Viaje": un momento (foto/lugar/texto)
   * sin reto por defecto, con el reto como capa opcional (toggle). Separa CONTENIDO
   * de RETO (flujos-viaje-po.md): el camino feliz es subir un recuerdo, no montar un juego.
   */
  groupAddMoment?: boolean
  /**
   * Intención de abrir el flujo INMERSIVO de crear reto (`#g=…&add=reto`): mapa
   * satélite a sangre + hoja que crece por etapas. Es la entrada del FAB "Reto"
   * del viaje. Sustituye al asistente clásico de 3 pasos (`&v=clasico&add=1`).
   */
  groupAddChallenge?: boolean
  /**
   * Origen del reto cuando NACE de un recuerdo (`#g=…&add=reto&from=<momentId>`):
   * el reto pre-rellena la foto y el lugar de ese recuerdo (los dos orígenes que
   * convergen). Sin `from`, el reto empieza vacío (FAB "Reto"). Solo se lee junto
   * a `add=reto`.
   */
  groupChallengeFrom?: string
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

  // Sección inicial del viaje: `marcador` (canónico) o `clasico` (legado de los
  // enlaces de la GroupPage de antes) abren el viaje en la pestaña "Marcador".
  // Cualquier otro valor se ignora y el viaje abre en "Diario".
  const v = params.get('v')?.trim()
  if (v === 'marcador' || v === 'clasico') route.groupView = 'marcador'

  // Intención de abrir "Añadir momento" directo (solo junto a la vista clásica).
  if (params.get('add')?.trim() === '1') route.groupAdd = true

  // Flujo ligero "Añadir recuerdo" del viaje (`#g=…&add=recuerdo`): la entrada del
  // FAB "＋" de la pantalla "Viaje". Tiene prioridad sobre `add=1` (que es el legado
  // del asistente de reto clásico) cuando ambos no coexisten.
  if (params.get('add')?.trim() === 'recuerdo') route.groupAddMoment = true

  // Flujo INMERSIVO de crear reto (`#g=…&add=reto`): la entrada del FAB "Reto".
  if (params.get('add')?.trim() === 'reto') {
    route.groupAddChallenge = true
    // Origen del reto: si nace de un recuerdo, `from` trae su id para pre-rellenar
    // foto y lugar. Solo tiene sentido junto a `add=reto`.
    const from = params.get('from')?.trim()
    if (from) route.groupChallengeFrom = from
  }

  return route
}

/** Construye el hash de un destino de grupo/reto, para `location.hash = …`. */
export function groupHash(groupId: string, challengeId?: string): string {
  const params = new URLSearchParams({ g: groupId })
  if (challengeId) params.set('c', challengeId)
  return `#${params.toString()}`
}

/**
 * Hash que abre un viaje directamente en la pestaña "Marcador" (`#g=…&v=marcador`).
 * El marcador ya no es una pantalla aparte: es la segunda sección del viaje.
 */
export function marcadorGroupHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&v=marcador`
}

/**
 * Alias de compatibilidad del antiguo enlace a la GroupPage clásica
 * (`#g=…&v=clasico`). `parseHash` sigue reconociendo `v=clasico` y lo trata como
 * "abrir en la pestaña Marcador", así que los enlaces viejos no se rompen. Para
 * destinos nuevos, usar `marcadorGroupHash`.
 */
export function classicGroupHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&v=clasico`
}

/**
 * Hash del flujo ligero "Añadir recuerdo" del viaje (`#g=…&add=recuerdo`). Es la
 * entrada del FAB "＋" de la pantalla "Viaje": abre el asistente de recuerdo (foto,
 * lugar y texto) con el reto como capa opcional, en vez del asistente de reto clásico.
 */
export function addMomentHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&add=recuerdo`
}

/**
 * Hash del flujo INMERSIVO de crear reto (`#g=…&add=reto`). Es la entrada del FAB
 * "Reto" del viaje: abre el mapa satélite a sangre + la hoja que crece por etapas,
 * en vez del asistente clásico de 3 pasos (que se retiró). Con `fromMomentId`, el
 * reto NACE de un recuerdo y pre-rellena su foto y lugar (`&from=<id>`).
 */
export function addChallengeHash(groupId: string, fromMomentId?: string): string {
  const base = `#g=${encodeURIComponent(groupId)}&add=reto`
  return fromMomentId ? `${base}&from=${encodeURIComponent(fromMomentId)}` : base
}
