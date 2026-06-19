import { supabase } from './supabase'

const BUCKET = 'images'

// Lado largo máximo tras redimensionar. ~1600px basta para ver la foto en
// pantalla y recorta peso de subida en móvil.
const MAX_SIDE = 1600
// Calidad JPEG: equilibrio peso/nitidez. La recompresión, de paso, estripa el
// EXIF (incluido el GPS, que sería la respuesta del reto).
const JPEG_QUALITY = 0.8

/**
 * Carga el archivo en un canvas, lo redimensiona a <= MAX_SIDE en su lado
 * largo y lo re-exporta a JPEG. Dibujar en canvas descarta los metadatos EXIF,
 * así que la foto sube sin GPS ni orientación original.
 */
async function compressAndStripExif(file: File): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvasToJpeg(canvas)
  } finally {
    bitmap.close()
  }
}

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longSide = Math.max(w, h)
  if (longSide <= MAX_SIDE) return { width: w, height: h }
  const scale = MAX_SIDE / longSide
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap respeta la orientación EXIF al rasterizar, así la foto
  // queda derecha aunque luego descartemos el metadato.
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Comprime, estripa EXIF y sube la imagen al bucket `images`. Devuelve el
 * `path` que se guarda en la fila del reto (la foto viaja con el enlace).
 */
export async function uploadImage(file: File): Promise<string> {
  const blob = await compressAndStripExif(file)
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw error
  return path
}

/** URL pública de una imagen del bucket a partir de su `path`. */
export function publicImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
