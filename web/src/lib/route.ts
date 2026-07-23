// Enrutado por hash. El grupo ("el viaje") y el reto activo viajan en el
// fragmento de la URL (`#g=<code>&c=<uuid>`) para poder compartirse por chat
// sin backend. El parser es tolerante: acepta claves en cualquier orden y
// hashes parciales (solo grupo, solo reto, o vacíos).
//
// Con cuentas + home (cuentas-y-home.md §3.4) aparecen dos rutas "de app" que no
// son grupos: `#nuevo` (crear grupo) y `#perfil` (editar perfil / cerrar sesión).
// Se modelan como vistas atómicas: si el hash es exactamente esa palabra, manda;
// el deep link `#g`/`#c` sigue funcionando igual que antes.

import { EXAMPLE_TRIP_GROUP_ID } from './exampleTrip'

export type View = 'home' | 'new' | 'profile'

export interface Route {
  /** Vista de app cuando hay sesión y no es un deep link de grupo/reto. */
  view: View
  group?: string
  challenge?: string
  /**
   * Sección inicial dentro del viaje (`#g=…&v=…`). Por defecto el viaje abre en
   * "Diario"; `v=marcador` (y el legado `v=clasico`) hace que el viaje arranque en
   * la pestaña "Marcador"; `v=fotos` en la pestaña "Fotos" (galería completa del
   * viaje, issue #645). Antes el marcador era una pantalla aparte (GroupPage);
   * ahora ambas son secciones del propio viaje, así que la ruta solo decide en
   * qué pestaña aterrizar. No afecta a los deep links de reto (`#c`).
   */
  groupView?: 'marcador' | 'fotos'
  /**
   * Coach-mark de ENTRADA al Marcador (`#g=…&v=marcador&guide=marcador`): quien
   * acaba de jugar su primer reto compartido como anónimo aterriza en el
   * Marcador con la guía del reto ya recorrida (ver `RetoShareGuide`); este
   * flag pide un único coach-mark que señale la clasificación real (el podio)
   * al entrar. Se CONSUME una sola vez al montar (mismo criterio que `tour=1`):
   * una recarga posterior no debe relanzarlo. Solo tiene sentido junto a
   * `v=marcador`.
   */
  groupGuide?: 'marcador'
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
  /**
   * PROMOCIÓN de un recuerdo YA guardado a reto (`#g=…&add=reto&promote=<momentId>`,
   * issue #723): abre el MISMO asistente completo que `from=`, pre-rellenado igual
   * (pin, foto, título), pero al lanzar NO crea un reto nuevo — PROMOCIONA ese
   * recuerdo (`promoteToChallenge`, mismo `challengeId`; el momento se convierte,
   * no se duplica). Es la entrada del botón "Convertir en reto" de la hoja del
   * momento. Solo se lee junto a `add=reto`; si coexiste con `from`, manda `promote`.
   */
  groupChallengePromote?: string
  /**
   * Token de un enlace de CO-DUEÑO (`#g=…&adm=<token>`, issue #707): en vez del
   * alta normal de miembro, `useDeepLinkJoin` canjea este token
   * (`redeemOwnerInvite`) para ascender directo a co-dueño. Un solo uso; si el
   * canje falla (caducado/usado/inválido) cae al alta normal. Se CONSUME (no
   * queda en la URL tras usarse), mismo criterio que `add=1`/`groupAdd`.
   */
  ownerInviteToken?: string
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
  // enlaces de la GroupPage de antes) abren el viaje en la pestaña "Marcador";
  // `fotos` en la pestaña "Fotos" (issue #645). Cualquier otro valor se ignora y
  // el viaje abre en "Diario".
  const v = params.get('v')?.trim()
  if (v === 'marcador' || v === 'clasico') route.groupView = 'marcador'
  else if (v === 'fotos') route.groupView = 'fotos'

  // Coach-mark de entrada al Marcador (`&guide=marcador`): solo tiene sentido si
  // se aterriza en el Marcador. TripPage lo consume una vez y lo quita del hash.
  if (params.get('guide')?.trim() === 'marcador' && route.groupView === 'marcador') {
    route.groupGuide = 'marcador'
  }

  // Intención de abrir "Añadir momento" directo (solo junto a la vista clásica).
  if (params.get('add')?.trim() === '1') route.groupAdd = true

  // Flujo ligero "Añadir recuerdo" del viaje (`#g=…&add=recuerdo`): la entrada del
  // FAB "＋" de la pantalla "Viaje". Tiene prioridad sobre `add=1` (que es el legado
  // del asistente de reto clásico) cuando ambos no coexisten.
  if (params.get('add')?.trim() === 'recuerdo') route.groupAddMoment = true

  // Flujo INMERSIVO de crear reto (`#g=…&add=reto`): la entrada del FAB "Reto".
  if (params.get('add')?.trim() === 'reto') {
    route.groupAddChallenge = true
    // Promoción de un recuerdo YA guardado (issue #723): `promote` trae su id.
    // Manda sobre `from` (no deberían coexistir; si lo hacen, promocionar es la
    // intención más específica y evita duplicar el recuerdo).
    const promote = params.get('promote')?.trim()
    if (promote) {
      route.groupChallengePromote = promote
    } else {
      // Origen del reto: si nace de un recuerdo NUEVO (desde "Recuerdo guardado"),
      // `from` trae su id para pre-rellenar foto y lugar.
      const from = params.get('from')?.trim()
      if (from) route.groupChallengeFrom = from
    }
  }

  // Enlace de co-dueño (`#g=…&adm=<token>`, issue #707): solo tiene sentido
  // junto a un grupo. `useDeepLinkJoin` lo consume y lo quita del hash tras
  // canjearlo (con éxito o fallback), así una recarga no reintenta el canje.
  const adm = params.get('adm')?.trim()
  if (adm) route.ownerInviteToken = adm

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
 * Como `marcadorGroupHash` pero pidiendo además el coach-mark de ENTRADA que
 * señala la clasificación (`&guide=marcador`). Lo usa el aterrizaje final de la
 * guía del reto compartido (`RetoShareGuide`): tras recorrer el resultado y la
 * explicación, se cae en el Marcador y se resalta el podio real una vez.
 * `TripPage` consume el flag al montar y lo retira del hash (mismo criterio que
 * `tour=1`), así una recarga no lo relanza.
 */
export function marcadorGuideGroupHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&v=marcador&guide=marcador`
}

/**
 * Hash que abre un viaje directamente en la pestaña "Fotos" (`#g=…&v=fotos`):
 * la galería completa del viaje, agrupada por día (issue #645). Mismo patrón
 * que `marcadorGroupHash`.
 */
export function fotosGroupHash(groupId: string): string {
  return `#g=${encodeURIComponent(groupId)}&v=fotos`
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

/**
 * Hash de PROMOCIONAR un recuerdo ya guardado a reto (`#g=…&add=reto&promote=<id>`,
 * issue #723). Es la entrada del botón "Convertir en reto" de la hoja del momento:
 * abre el mismo asistente completo que `addChallengeHash(g, from)`, pre-rellenado
 * igual, pero al lanzar PROMOCIONA ese recuerdo (mismo `challengeId`) en vez de
 * crear un reto nuevo.
 */
export function promoteChallengeHash(groupId: string, momentId: string): string {
  return `#g=${encodeURIComponent(groupId)}&add=reto&promote=${encodeURIComponent(momentId)}`
}

/**
 * Hash del enlace de CO-DUEÑO (`#g=…&adm=<token>`, issue #707): al abrirlo con
 * sesión, `useDeepLinkJoin` canjea el token en vez de hacer el alta normal de
 * miembro. Lo genera `InviteModal` con el token que devuelve `createOwnerInvite`.
 */
export function ownerInviteHash(groupId: string, token: string): string {
  return `#g=${encodeURIComponent(groupId)}&adm=${encodeURIComponent(token)}`
}

/**
 * Quita `adm=<token>` de un hash, preservando el resto de parámetros tal cual
 * (mismo criterio de "hash tal cual, sin reconstruir" que `useDeepLinkJoin`).
 * El token es de UN SOLO USO (issue #707): `useDeepLinkJoin` lo consume tras
 * intentar el canje (con éxito o fallback) para que un F5 no lo reintente.
 */
export function stripOwnerInviteToken(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.includes('adm=')) return hash.startsWith('#') ? hash : `#${hash}`
  const params = new URLSearchParams(raw)
  params.delete('adm')
  return `#${params.toString()}`
}

/**
 * Hash del viaje de EJEMPLO (onboarding nuevo, pieza 4/4, `lib/exampleTrip.ts`):
 * `#g=ejemplo` abre el mismo viaje que "Ver un viaje de ejemplo" del perfil,
 * `withTour` añade `&tour=1` para arrancar además la guía conducida
 * (`GuidedTour`) — `TripPage` la consume una sola vez al montar y la retira
 * del hash, igual criterio que `ownerInviteToken`/`stripOwnerInviteToken`.
 *
 * `fromNewUser` añade además `&nuevo=1` (issue #905): marca que el recorrido
 * NACE de la bienvenida del usuario nuevo (home vacía), no del perfil. Con él,
 * `TripPage` remata el cierre de la guía con "Ahora crea el tuyo" → Crear viaje,
 * en vez del cierre neutro de "Ver un viaje de ejemplo". Solo tiene sentido
 * junto al tour (la guía conducida lo consume, igual que `tour`).
 *
 * `fromLanding` añade `&from=landing` (issue #916): marca que el recorrido lo
 * arranca un VISITANTE SIN sesión desde la landing pública ("Ver un ejemplo").
 * Con él, `TripPage` remata el cierre de la guía invitando a REGISTRARSE
 * ("Empieza a compartir" → auth) en vez de navegar a `#nuevo` (que exige sesión).
 * Excluyente con `fromNewUser` (orígenes distintos); solo tiene sentido junto al
 * tour, que lo consume igual que `tour`/`nuevo`.
 */
export function exampleTripHash(
  withTour = false,
  fromNewUser = false,
  fromLanding = false,
): string {
  const params = new URLSearchParams({ g: EXAMPLE_TRIP_GROUP_ID })
  if (withTour) params.set('tour', '1')
  if (withTour && fromNewUser) params.set('nuevo', '1')
  if (withTour && fromLanding) params.set('from', 'landing')
  return `#${params.toString()}`
}
