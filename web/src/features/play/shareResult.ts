// Texto y enlace para compartir TU resultado de un reto (la apuesta viral): pica
// al resto a jugar SIN revelar la ubicación. Funciones puras (testeables) y sin
// dependencias del DOM; la rasterización/compartir se reutiliza de la tarjeta de
// clasificación (features/group/shareLeaderboard).

// Enlace al reto concreto (#g=<grupo>&c=<reto>), mismo formato que el resto de la
// app (challengeLink en GroupPage / navigation). El receptor abre justo este reto.
export function buildChallengeLink(groupId: string, challengeId: string): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(challengeId)}`
}

// Caption MÍNIMO: una línea de gancho + el enlace clicable (la imagen no lo es).
// SIN SPOILER: no menciona ubicación, lugar ni coordenadas. Relato de recuerdos
// compartidos: invita a vivir el viaje; el reto a superar viaja en la IMAGEN
// (puntos/distancia), no en el texto, para no duplicar.
export function buildResultShareText(groupName: string, link: string): string {
  return `📍 Vive este viaje conmigo en ${groupName} 👉 ${link}`
}
