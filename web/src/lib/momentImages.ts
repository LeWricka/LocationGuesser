import { supabase } from './supabase'
import type { Database } from './database.types'

/**
 * Galería de fotos de un MOMENTO (recuerdo). Modelo: tabla `moment_images`, N
 * filas por momento (migración 0023). Reglas clave:
 *
 *  - La VISUALIZACIÓN se ordena por `sort_at` asc (fecha de captura EXIF si la
 *    hay, si no la hora de subida — columna generada, migración 0048/#950) por
 *    DEFECTO: así las fotos de varios subiendo a la vez salen en orden
 *    cronológico. Si el dueño arrastra para reordenar a mano
 *    (`reorderMomentImages`, migración 0049/#952), ESE momento pasa a orden
 *    MANUAL (`challenges.photos_manual_order = true`) y la visualización se
 *    ordena por `sort_order` en su lugar, hasta que vuelva a orden por fecha
 *    (`setPhotosAutoOrder`).
 *  - La PORTADA es OTRA cosa: la fila de menor `sort_order` (el orden en que se
 *    subió/eligió), NO la posición [0] tras ordenar por `sort_at`/`sort_order`. Por
 *    COMPATIBILIDAD, `challenges.image_path` SIGUE siendo la portada: lo leen
 *    la tarjeta del viaje, el mapamundi, el pin-foto, etc. Por eso, cada vez que
 *    cambia la portada (subir la 1ª foto, marcar otra, quitar la actual o
 *    reordenar), hay que ESPEJARLA en `challenges.image_path` desde el cliente.
 *  - RLS: SELECT = miembro del grupo; INSERT/UPDATE/DELETE = dueño del grupo.
 *    `photos_manual_order` vive en `challenges`, mismo perímetro de UPDATE que
 *    el resto de columnas del momento (dueño) — no necesita política propia.
 *
 * Solo aplica a RECUERDOS: el RETO se queda con su única foto (la que se adivina).
 */
export type MomentImage = Database['public']['Tables']['moment_images']['Row']

/** Foto nueva a añadir a la galería: su path ya subido + la meta EXIF leída del original. */
export interface NewMomentImage {
  path: string
  takenAt: string | null
  lat: number | null
  lng: number | null
}

/**
 * La PORTADA es la fila de menor `sort_order` — NO la posición [0] del array
 * (que ahora viene ordenado por `sort_at`, no por `sort_order`). Requiere
 * `images` no vacío.
 */
function coverOf(images: MomentImage[]): MomentImage {
  return images.reduce((min, img) => (img.sort_order < min.sort_order ? img : min))
}

/**
 * ¿Está la galería de este momento en orden MANUAL (`challenges.photos_manual_order`,
 * migración 0049/#952)? `false` (el default) = orden por fecha de captura
 * (#951). Exportada para que la UI (`MomentGallery`) sepa si mostrar "Volver a
 * orden por fecha" y si activar el arrastre.
 */
export async function getPhotosManualOrder(challengeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('challenges')
    .select('photos_manual_order')
    .eq('id', challengeId)
    .single()
  if (error) throw error
  return data?.photos_manual_order ?? false
}

/**
 * Lista la galería de un momento en su orden de VISUALIZACIÓN: por
 * `sort_order` si el momento está en orden MANUAL (tras arrastrar, #952), si
 * no por `sort_at` (fecha de captura, comportamiento por defecto, #951).
 */
export async function listMomentImages(challengeId: string): Promise<MomentImage[]> {
  const manual = await getPhotosManualOrder(challengeId)
  const { data, error } = await supabase
    .from('moment_images')
    .select(
      'id, challenge_id, image_path, sort_order, taken_at, gps_lat, gps_lng, sort_at, created_at',
    )
    .eq('challenge_id', challengeId)
    .order(manual ? 'sort_order' : 'sort_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Lista la galería de VARIOS momentos a la vez (patrón dos-consultas: el
 * llamante ya tiene los ids de `challenges` del grupo — de `getGroupChallenges`
 * o `useTripData` — así que aquí solo hace falta el `.in()` sobre
 * `moment_images`; `moment_images` no lleva `group_id` propio, así que no se
 * puede filtrar por grupo en una sola consulta/JOIN vía PostgREST, igual gotcha
 * que `listTripPhotos` en `groupData.ts`). Agrupa por `challenge_id`,
 * conservando el orden `sort_at` asc DENTRO de cada momento (el `.order()`
 * es global al resultado, pero como el `sort_at` de cada momento es
 * independiente, el orden relativo dentro de cada grupo se conserva).
 * Usa la pestaña Fotos del viaje (issue #645) para pintar la galería completa
 * sin una consulta por momento.
 */
export async function listGroupMomentImages(
  challengeIds: string[],
): Promise<Map<string, MomentImage[]>> {
  const byChallenge = new Map<string, MomentImage[]>()
  if (challengeIds.length === 0) return byChallenge
  const { data, error } = await supabase
    .from('moment_images')
    .select(
      'id, challenge_id, image_path, sort_order, taken_at, gps_lat, gps_lng, sort_at, created_at',
    )
    .in('challenge_id', challengeIds)
    .order('sort_at', { ascending: true })
  if (error) throw error
  for (const row of data ?? []) {
    const bucket = byChallenge.get(row.challenge_id)
    if (bucket) bucket.push(row)
    else byChallenge.set(row.challenge_id, [row])
  }
  return byChallenge
}

/**
 * Espeja la portada (la imagen de menor `sort_order`, o null si no quedan) en
 * `challenges.image_path`, para que la tarjeta del viaje y el mapamundi reflejen
 * la nueva portada. Lo hace el cliente porque `image_path` no se deriva en BD.
 */
async function mirrorCover(challengeId: string, imagePath: string | null): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .update({ image_path: imagePath })
    .eq('id', challengeId)
  if (error) throw error
}

/**
 * Añade fotos a la galería de un momento. Inserta con `sort_order` incremental
 * tras el máximo actual (ya no necesariamente el ÚLTIMO elemento de la lista:
 * `listMomentImages` viene ordenada por `sort_at`, no por `sort_order`). Si el
 * momento aún no tenía portada (galería vacía), espeja la primera nueva en
 * `challenges.image_path`.
 *
 * Cada item trae su `path` ya subido a Storage (con `uploadImage`, sin EXIF) y
 * la meta EXIF (`takenAt`/`lat`/`lng`) leída del archivo ORIGINAL antes de
 * subir (issue #950): se guarda en BD para poder ordenar por fecha de captura.
 */
export async function addMomentImages(challengeId: string, items: NewMomentImage[]): Promise<void> {
  if (items.length === 0) return

  const existing = await listMomentImages(challengeId)
  // Siguiente hueco tras el máximo `sort_order` actual: las nuevas se añaden al final.
  const maxSortOrder = existing.reduce((max, img) => Math.max(max, img.sort_order), -1)
  const rows = items.map((item, i) => ({
    challenge_id: challengeId,
    image_path: item.path,
    sort_order: maxSortOrder + 1 + i,
    taken_at: item.takenAt,
    gps_lat: item.lat,
    gps_lng: item.lng,
  }))
  const { error } = await supabase.from('moment_images').insert(rows)
  if (error) throw error

  // Sin portada previa: la primera de las nuevas pasa a ser la portada espejada.
  if (existing.length === 0) {
    await mirrorCover(challengeId, items[0].path)
  }
}

/**
 * Marca una imagen como PORTADA y espeja su `image_path` en
 * `challenges.image_path`. La portada es la fila de menor `sort_order`
 * (independiente del orden de VISUALIZACIÓN, que es por `sort_at`): basta con
 * INTERCAMBIAR el `sort_order` de la elegida con el de la portada actual, así
 * la elegida hereda el mínimo sin tener que renumerar el resto de la galería.
 * No-op si la imagen ya es la portada.
 */
export async function setMomentCover(challengeId: string, imageId: string): Promise<void> {
  const images = await listMomentImages(challengeId)
  const target = images.find((img) => img.id === imageId)
  if (!target) throw new Error('La foto ya no está en la galería.')
  const current = coverOf(images)
  if (current.id === imageId) return // Ya es la portada.

  const { error: swapIn } = await supabase
    .from('moment_images')
    .update({ sort_order: current.sort_order })
    .eq('id', target.id)
  if (swapIn) throw swapIn
  const { error: swapOut } = await supabase
    .from('moment_images')
    .update({ sort_order: target.sort_order })
    .eq('id', current.id)
  if (swapOut) throw swapOut

  await mirrorCover(challengeId, target.image_path)
}

/**
 * Quita una foto de la galería. Si era la portada (menor `sort_order`), la
 * nueva portada es la que quede con menor `sort_order` y se re-espeja en
 * `challenges.image_path`; si no queda ninguna, deja `image_path = null` (no
 * hay portada que mostrar). El archivo de Storage no se borra aquí (lo hace el
 * ciclo de limpieza del bucket si procede).
 */
export async function removeMomentImage(challengeId: string, imageId: string): Promise<void> {
  const images = await listMomentImages(challengeId)
  const wasCover = images.length > 0 && coverOf(images).id === imageId

  const { error } = await supabase.from('moment_images').delete().eq('id', imageId)
  if (error) throw error

  if (wasCover) {
    const remaining = images.filter((img) => img.id !== imageId)
    await mirrorCover(challengeId, remaining.length > 0 ? coverOf(remaining).image_path : null)
  }
}

/**
 * Reordena la galería de un momento A MANO (arrastrar y soltar en
 * `MomentGallery`, issue #952): reasigna `sort_order` 0..N-1 según
 * `orderedIds` (el nuevo orden tras soltar), pasa el momento a orden MANUAL
 * (`challenges.photos_manual_order = true`, así se queda aunque lleguen fotos
 * nuevas por fecha) y re-espeja la portada. Tras reasignar 0..N-1 en ESE
 * orden, la portada (menor `sort_order`) es SIEMPRE `orderedIds[0]` — no hace
 * falta releer la galería para saberlo, basta con la foto que ya traíamos.
 */
export async function reorderMomentImages(
  challengeId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return

  // Necesitamos el `image_path` de la nueva portada (orderedIds[0]) para
  // re-espejarla; lo sacamos de la galería actual (no depende del orden en que
  // venga, solo de qué imagen es cuál).
  const images = await listMomentImages(challengeId)
  const pathById = new Map(images.map((img) => [img.id, img.image_path]))

  const reassignments = orderedIds.map(async (id, i) => {
    const { error } = await supabase.from('moment_images').update({ sort_order: i }).eq('id', id)
    if (error) throw error
  })
  await Promise.all(reassignments)

  const { error: flagError } = await supabase
    .from('challenges')
    .update({ photos_manual_order: true })
    .eq('id', challengeId)
  if (flagError) throw flagError

  await mirrorCover(challengeId, pathById.get(orderedIds[0]) ?? null)
}

/**
 * Vuelve el momento a orden AUTOMÁTICO (por fecha de captura, `sort_at` —
 * comportamiento por defecto, #951): apaga `challenges.photos_manual_order`.
 * El `sort_order` de cada foto se deja tal cual (no hace falta re-numerarlo:
 * en orden automático no se usa para pintar la galería, solo para desempatar
 * la portada).
 */
export async function setPhotosAutoOrder(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .update({ photos_manual_order: false })
    .eq('id', challengeId)
  if (error) throw error
}
