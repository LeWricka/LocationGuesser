import { supabase } from './supabase'

const BUCKET = 'images'

// Lado largo máximo tras redimensionar. ~1600px basta para ver la foto en
// pantalla y recorta peso de subida en móvil.
const MAX_SIDE = 1600
// Calidad JPEG: equilibrio peso/nitidez. La recompresión, de paso, estripa el
// EXIF (incluido el GPS, que sería la respuesta del reto).
const JPEG_QUALITY = 0.8

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  release: () => void
}

/**
 * Decodifica el archivo de forma robusta en móvil:
 * 1) `createImageBitmap` (rápido y respeta la orientación EXIF).
 * 2) Fallback a `<img>` + `decode()` si lo anterior falla — pasa en algunos
 *    Chrome de Android (p.ej. Pixel) con JPEG grandes o progresivos, que lanzan
 *    "source image could not be decoded". Los navegadores aplican la
 *    orientación EXIF a `<img>`, así que el canvas queda derecho igualmente.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      release: () => bitmap.close(),
    }
  } catch {
    // createImageBitmap no pudo: probamos con <img>.
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      release: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('No se pudo leer la imagen. Prueba con otra foto (JPEG o PNG).')
  }
}

/**
 * Carga el archivo, lo redimensiona a <= MAX_SIDE en su lado largo y lo
 * re-exporta a JPEG. Dibujar en canvas descarta los metadatos EXIF, así que la
 * foto sube sin GPS ni orientación original.
 */
async function compressAndStripExif(file: File): Promise<Blob> {
  const img = await decodeImage(file)
  try {
    const { width, height } = scaledSize(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen.')
    ctx.drawImage(img.source, 0, 0, width, height)
    return await canvasToJpeg(canvas)
  } finally {
    img.release()
  }
}

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longSide = Math.max(w, h)
  if (longSide <= MAX_SIDE) return { width: w, height: h }
  const scale = MAX_SIDE / longSide
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
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

/**
 * URL firmada (temporal) de una imagen del bucket a partir de su `path`. El
 * bucket es PRIVADO (la foto puede revelar el sitio = la respuesta, sobre todo
 * en modo sorpresa), así que no vale `getPublicUrl`: se firma con caducidad y
 * solo un usuario autenticado (miembro) puede generarla (RLS de storage). Null
 * si no se puede firmar. Async: se resuelve en el cliente.
 */
export async function signedImageUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) return null
  return data?.signedUrl ?? null
}
