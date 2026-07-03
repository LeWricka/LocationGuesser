// Portada de la tarjeta-IMAGEN de "Invitar al viaje" (issue #617). Cascada, de
// más a menos específica:
//   1. Portada EXPLÍCITA del viaje (`cover_image_path`, la que el dueño fijó a
//      mano en los ajustes).
//   2. Foto del ÚLTIMO recuerdo (reto) con imagen — el mismo circuito que ya
//      usa `ShareLeaderboardModal` (`lib/lastChallengeImage`).
//   3. Portada derivada del NOMBRE del viaje vía `resolvePlaceCover`
//      (Wikipedia, sin API key) — mismo fallback que usa la home.
//   4. `null` — la tarjeta cae a su fondo de marca (mapa nocturno), sin
//      bloquear la invitación por no tener foto.
//
// Reutiliza las piezas ya existentes en vez de duplicarlas: `getGroup` (grupo),
// `lastChallengeImageDataUrl` (recuerdo), `resolvePlaceCover` (lugar) y la
// conversión a data URL de `features/create/challengeShareCover` (mismo motivo
// que allí: Storage/Wikipedia son otro origen y un <img> remoto deja el canvas
// de html-to-image "tainted", en blanco al rasterizar).
//
// Best-effort en cada paso: un fallo de red/permiso NUNCA lanza, solo hace caer
// al siguiente nivel de la cascada (o a null). Invitar al viaje no debe
// bloquearse porque Wikipedia o el Storage tengan un mal día.

import { getGroup } from '../../lib/groupData'
import { lastChallengeImageDataUrl } from '../../lib/lastChallengeImage'
import { resolvePlaceCover } from '../../lib/placeCover'
import { storagePathToDataUrl, urlToDataUrl } from '../create/challengeShareCover'

/**
 * Resuelve la portada de fondo de la tarjeta-invitación de un viaje, siguiendo
 * la cascada del comentario de arriba. Nunca lanza: ante cualquier fallo en un
 * nivel, sigue al siguiente. `null` = sin portada (fondo de marca).
 */
export async function resolveTripInviteCover(
  groupId: string,
  groupName: string | null,
): Promise<string | null> {
  // 1. Portada explícita del viaje.
  try {
    const group = await getGroup(groupId)
    if (group?.cover_image_path) {
      const cover = await storagePathToDataUrl(group.cover_image_path)
      if (cover) return cover
    }
  } catch {
    // Sigue al recuerdo/lugar igualmente.
  }

  // 2. Foto del último recuerdo (reto) con imagen.
  const lastMemory = await lastChallengeImageDataUrl(groupId)
  if (lastMemory) return lastMemory

  // 3. Portada derivada del nombre del viaje.
  const placeCover = await resolvePlaceCover(groupName)
  if (placeCover.imageUrl) {
    const derived = await urlToDataUrl(placeCover.imageUrl)
    if (derived) return derived
  }

  // 4. Nada resuelto: la tarjeta cae a su fondo de marca.
  return null
}
