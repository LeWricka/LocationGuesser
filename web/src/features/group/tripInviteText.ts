// Copy y metadatos de la tarjeta-IMAGEN de "Invitar al viaje" (issue #617):
// mismo patrón que `features/create/shareChallengeCard` — funciones PURAS
// (sin DOM ni red), fáciles de testear. El enlace vive SOLO en el caption que
// acompaña a la imagen (Web Share / portapapeles), nunca estampado en el PNG.

import { tripShareText } from '../../lib/shareLinks'

/** Texto "N retos" / "Aún sin retos" para la meta del preview y de la tarjeta.
 * Exportada (antes vivía solo en `InviteModal`): la reutiliza también la
 * tarjeta-imagen para no duplicar la regla singular/plural. */
export function challengesLabel(count: number): string {
  if (count <= 0) return 'aún sin retos'
  return count === 1 ? '1 reto' : `${count} retos`
}

/** Texto "N viajeros" para la línea de meta de la tarjeta-imagen (distinto del
 * "N personas" del preview de texto del modal: en la imagen hablamos de
 * "viajeros", el lenguaje del propio producto). */
export function travelersLabel(count: number): string {
  return count === 1 ? '1 viajero' : `${count} viajeros`
}

/**
 * Línea de meta de la tarjeta-imagen: "N viajeros · N retos". Si aún no se
 * conoce el nº de miembros (`null`, mientras carga), se muestra solo la línea
 * de retos: no bloqueamos el rasterizado por un dato secundario.
 */
export function tripInviteMetaLine(memberCount: number | null, challengeCount: number): string {
  const challenges = challengesLabel(challengeCount)
  if (memberCount == null) return challenges
  return `${travelersLabel(memberCount)} · ${challenges}`
}

/** Caption del mensaje al compartir la tarjeta-imagen: el mismo texto cálido de
 * siempre (`tripShareText`) + el enlace, en su propia línea. El enlace NUNCA va
 * estampado en la imagen. */
export function buildInviteCaption(authorName: string, tripName: string, link: string): string {
  return `${tripShareText(authorName, tripName)}\n${link}`
}
