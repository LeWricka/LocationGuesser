import { supabase } from './supabase'
import type { Database } from './database.types'

/**
 * Galería de fotos de un MOMENTO (recuerdo). Modelo: tabla `moment_images`, N
 * filas por momento ordenadas por `sort_order` (migración 0023). Reglas clave:
 *
 *  - La PORTADA es la fila de menor `sort_order`.
 *  - Por COMPATIBILIDAD, `challenges.image_path` SIGUE siendo la portada: lo leen
 *    la tarjeta del viaje, el mapamundi, el pin-foto, etc. Por eso, cada vez que
 *    cambia la portada (subir la 1ª foto, marcar otra, o quitar la actual), hay
 *    que ESPEJARLA en `challenges.image_path` desde el cliente.
 *  - RLS: SELECT = miembro del grupo; INSERT/UPDATE/DELETE = dueño del grupo.
 *
 * Solo aplica a RECUERDOS: el RETO se queda con su única foto (la que se adivina).
 */
export type MomentImage = Database['public']['Tables']['moment_images']['Row']

/** Lista la galería de un momento en orden de portada (sort_order asc). */
export async function listMomentImages(challengeId: string): Promise<MomentImage[]> {
  const { data, error } = await supabase
    .from('moment_images')
    .select('id, challenge_id, image_path, sort_order, created_at')
    .eq('challenge_id', challengeId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
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
 * tras el máximo actual (las nuevas van al final). Si el momento aún no tenía
 * portada (galería vacía), espeja la primera nueva en `challenges.image_path`.
 *
 * `paths` son los paths ya subidos a Storage (con `uploadImage`, sin EXIF).
 */
export async function addMomentImages(challengeId: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const existing = await listMomentImages(challengeId)
  // Siguiente hueco tras el máximo actual: las nuevas se añaden al final.
  const base = existing.length > 0 ? existing[existing.length - 1].sort_order + 1 : 0
  const rows = paths.map((image_path, i) => ({
    challenge_id: challengeId,
    image_path,
    sort_order: base + i,
  }))
  const { error } = await supabase.from('moment_images').insert(rows)
  if (error) throw error

  // Sin portada previa: la primera de las nuevas pasa a ser la portada espejada.
  if (existing.length === 0) {
    await mirrorCover(challengeId, paths[0])
  }
}

/**
 * Marca una imagen como PORTADA: queda con el menor `sort_order` y se espeja su
 * `image_path` en `challenges.image_path`. Renumera el resto a 1, 2, 3… para
 * mantener el orden estable y sin colisiones (sort_order es único de facto en la
 * galería). No-op si la imagen ya es la portada.
 */
export async function setMomentCover(challengeId: string, imageId: string): Promise<void> {
  const images = await listMomentImages(challengeId)
  const target = images.find((img) => img.id === imageId)
  if (!target) throw new Error('La foto ya no está en la galería.')
  if (images[0]?.id === imageId) return // Ya es la portada.

  // Nuevo orden: la elegida primero (0), el resto detrás conservando su orden.
  const reordered = [target, ...images.filter((img) => img.id !== imageId)]
  await Promise.all(
    reordered.map((img, i) =>
      img.sort_order === i
        ? Promise.resolve()
        : supabase
            .from('moment_images')
            .update({ sort_order: i })
            .eq('id', img.id)
            .then(({ error }) => {
              if (error) throw error
            }),
    ),
  )
  await mirrorCover(challengeId, target.image_path)
}

/**
 * Quita una foto de la galería. Si era la portada, la nueva portada es la
 * siguiente de menor orden y se re-espeja en `challenges.image_path`; si no queda
 * ninguna, deja `image_path = null` (no hay portada que mostrar). El archivo de
 * Storage no se borra aquí (lo hace el ciclo de limpieza del bucket si procede).
 */
export async function removeMomentImage(challengeId: string, imageId: string): Promise<void> {
  const images = await listMomentImages(challengeId)
  const wasCover = images[0]?.id === imageId

  const { error } = await supabase.from('moment_images').delete().eq('id', imageId)
  if (error) throw error

  if (wasCover) {
    // La nueva portada es la siguiente (la galería ya venía ordenada asc).
    const next = images.find((img) => img.id !== imageId) ?? null
    await mirrorCover(challengeId, next ? next.image_path : null)
  }
}
