// Caption del mensaje al compartir el reto como TARJETA-IMAGEN (issue #595): el
// enlace vive AQUÍ, en el texto que acompaña a la imagen (Web Share / portapapeles
// / WhatsApp) — nunca estampado en la propia imagen (la tarjeta lleva nombre del
// reto, del viaje, wordmark y CTA, pero ningún link). Función pura (testeable).
//
// La rasterización y el propio Web Share/descarga de la imagen SÍ se reutilizan
// de `features/group/shareLeaderboard` (mismo patrón que ya sigue
// `features/play/shareResult`, que reusa esa misma pieza en vez de duplicarla).
import { challengeShareText } from '../../lib/shareLinks'

/** Texto + enlace para compartir la tarjeta-imagen del reto recién creado. */
export function buildShareCaption(authorName: string, link: string): string {
  return `${challengeShareText(authorName)}\n${link}`
}
