// Texto y enlace para compartir TU resultado de un reto (la apuesta viral): pica
// al resto a jugar SIN revelar la ubicación. Funciones puras (testeables) y sin
// dependencias del DOM; la rasterización/compartir se reutiliza de la tarjeta de
// clasificación (features/group/shareLeaderboard).

import { challengeShareUrl } from '../../lib/shareLinks'

// Enlace LIMPIO al reto concreto (`…/j/<reto>`): genera la tarjeta OG al pegarlo y
// es más fiable que el hash crudo. El receptor abre justo este reto (la función
// serverless resuelve el grupo; el cliente lo resuelve por compatibilidad en
// lib/cleanRoute). `groupId` ya no hace falta en la URL, pero se mantiene en la
// firma para no tocar las llamadas existentes en PlayChallenge.
export function buildChallengeLink(_groupId: string, challengeId: string): string {
  return challengeShareUrl(location.origin, challengeId)
}

// Caption MÍNIMO: una línea de gancho + el enlace clicable (la imagen no lo es).
// SIN SPOILER: no menciona ubicación, lugar ni coordenadas. Relato de recuerdos
// compartidos: invita a vivir el viaje; el reto a superar viaja en la IMAGEN
// (puntos/distancia), no en el texto, para no duplicar.
export function buildResultShareText(groupName: string, link: string): string {
  return `📍 Vive este viaje conmigo en ${groupName} 👉 ${link}`
}
