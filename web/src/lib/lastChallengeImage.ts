import { supabase } from './supabase'
import { signedImageUrl } from './storage'
import type { Challenge } from './database.types'

/**
 * Foto del ÚLTIMO reto del grupo con imagen, como data URL lista para incrustar
 * en una tarjeta que se rasteriza con html-to-image. Devolvemos data URL (no la
 * URL firmada cruda) a propósito: la imagen vive en Storage (otro origen) y, si
 * el <img> apunta a la URL remota, el canvas de html-to-image queda "tainted" y
 * la miniatura sale en blanco. Convertirla a base64 la vuelve same-origin para
 * el snapshot. Null si el grupo no tiene retos con foto o algo falla (la tarjeta
 * funciona igual sin miniatura).
 */
export async function lastChallengeImageDataUrl(groupId: string): Promise<string | null> {
  // Solo retos con imagen, el más reciente primero; basta con uno.
  const { data, error } = await supabase
    .from('challenges')
    .select('image_path')
    .eq('group_id', groupId)
    .not('image_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Challenge, 'image_path'>>()
  if (error || !data?.image_path) return null

  const url = await signedImageUrl(data.image_path)
  if (!url) return null

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

// Convierte un Blob a data URL (base64). Lo usamos para incrustar la foto en la
// tarjeta sin que sea cross-origin al rasterizar.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(blob)
  })
}
