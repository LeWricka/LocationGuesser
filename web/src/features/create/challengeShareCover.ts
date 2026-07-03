// Portada de la tarjeta-IMAGEN de "¡Reto creado!" (issue #595). Cascada, de más a
// menos específica:
//   1. Foto DEL PROPIO reto (si el creador añadió una en el paso de reglas).
//   2. Portada del VIAJE — el mismo circuito que ya resuelve la home
//      (HomeDashboard/useAutoCover): la portada propia del grupo
//      (`cover_image_path`) o, si no tiene, la derivada de su nombre vía
//      `resolvePlaceCover` (Wikipedia, sin API key).
//   3. `null` — la tarjeta cae a su fondo de marca (mapa nocturno), sin bloquear
//      el compartir por no tener foto.
//
// Todas las imágenes se convierten a DATA URL (mismo motivo que
// `lib/lastChallengeImage`): Storage y Wikipedia son otro origen, y si el <img>
// de la tarjeta apunta a la URL remota, el canvas de html-to-image queda
// "tainted" y la miniatura sale en blanco al rasterizar.
//
// Best-effort en cada paso: un fallo de red/permiso NUNCA lanza, solo hace caer
// al siguiente nivel de la cascada (o a null). Compartir el reto no debe
// bloquearse porque Wikipedia o el Storage tengan un mal día.

import { getGroup } from '../../lib/groupData'
import { signedImageUrl } from '../../lib/storage'
import { resolvePlaceCover } from '../../lib/placeCover'

/** Convierte un Blob a data URL (base64). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(blob)
  })
}

/** Descarga cualquier URL de imagen (Storage firmada o remota) y la vuelve data
 * URL. `null` ante cualquier fallo (red, CORS, 404…), nunca lanza. Exportada:
 * la reutiliza también la cascada de portada de la invitación al viaje
 * (`features/group/tripInviteCover`, issue #617) para no duplicar la conversión. */
export async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

/** Firma un path de Storage y lo vuelve data URL; null ante cualquier fallo.
 * Exportada por el mismo motivo que `urlToDataUrl` (reutilizada por
 * `features/group/tripInviteCover`, issue #617). */
export async function storagePathToDataUrl(path: string): Promise<string | null> {
  try {
    const url = await signedImageUrl(path)
    if (!url) return null
    return await urlToDataUrl(url)
  } catch {
    return null
  }
}

/**
 * Resuelve la portada de fondo de la tarjeta-compartir de un reto, siguiendo la
 * cascada del comentario de arriba. Nunca lanza: ante cualquier fallo en un
 * nivel, sigue al siguiente. `null` = sin portada (fondo de marca).
 */
export async function resolveChallengeShareCover(
  challengeImagePath: string | null,
  groupId: string,
  groupName: string | null,
): Promise<string | null> {
  // 1. Foto del propio reto.
  if (challengeImagePath) {
    const own = await storagePathToDataUrl(challengeImagePath)
    if (own) return own
  }

  // 2. Portada del viaje: propia o derivada del lugar (mismo circuito de la home).
  try {
    const group = await getGroup(groupId)
    if (group?.cover_image_path) {
      const cover = await storagePathToDataUrl(group.cover_image_path)
      if (cover) return cover
    }
  } catch {
    // Sigue a la portada derivada del lugar igualmente.
  }

  const placeCover = await resolvePlaceCover(groupName)
  if (placeCover.imageUrl) {
    const derived = await urlToDataUrl(placeCover.imageUrl)
    if (derived) return derived
  }

  // 3. Nada resuelto: la tarjeta cae a su fondo de marca.
  return null
}
