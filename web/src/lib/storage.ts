import { supabase } from './supabase'
import { reportError } from './observability'

const BUCKET = 'images'
// Bucket PÚBLICO para avatares: a diferencia de `images` (privado, URLs firmadas
// que caducan), el avatar se muestra en clasificación, mapa, etc. y necesita una
// URL ESTABLE. La foto de perfil no es secreta, así que servirla pública vale.
const AVATARS_BUCKET = 'avatars'

// Lado largo máximo tras redimensionar. ~1600px basta para ver la foto en
// pantalla y recorta peso de subida en móvil.
const MAX_SIDE = 1600
// Lado del avatar tras recortar a cuadrado: nítido en el tamaño grande (64px) y
// en alta densidad, sin engordar el bucket público.
const AVATAR_SIDE = 256
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
 * ¿Es la foto un HEIC/HEIF de iPhone? Los navegadores que no lo decodifican
 * nativamente (Chrome, Firefox de escritorio) no pueden con `createImageBitmap`
 * ni `<img>.decode()`, así que hay que convertirla antes. Detectamos por MIME
 * (`image/heic`/`image/heif`) y, como respaldo, por extensión: en algunos
 * navegadores el `file.type` de un HEIC viene vacío.
 */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return /\.(heic|heif)$/i.test(file.name)
}

/**
 * Convierte un HEIC/HEIF a un File JPEG con `heic2any` (wasm de libheif). Import
 * DINÁMICO: la librería es pesada (wasm) y solo entra al bundle cuando de verdad
 * llega un HEIC; además es navegador-only, así que el import diferido evita
 * romper SSR/tests. El resto del pipeline (canvas → JPEG) sigue igual.
 */
async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY })
  // heic2any devuelve Blob o Blob[] (multi-imagen); nos quedamos con el primero.
  const blob = Array.isArray(converted) ? converted[0] : converted
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
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
  // HEIC/HEIF (iPhone): muchos navegadores no lo decodifican; lo convertimos a
  // JPEG antes de entrar en el pipeline de canvas. Las fotos JPEG/PNG/WebP NO
  // pasan por aquí (no engordan ni se ralentizan con la conversión).
  let decodable = file
  if (isHeic(file)) {
    try {
      decodable = await heicToJpeg(file)
    } catch (err) {
      // La conversión falló: reportamos metadatos NO sensibles (sin subir la
      // imagen) y lanzamos el error legible para el toast.
      reportError(err, {
        area: 'image_decode',
        stage: 'heic_convert',
        fileType: file.type || '(vacío)',
        fileSizeKb: Math.round(file.size / 1024),
        fileName: file.name,
      })
      throw new Error('No se pudo leer la imagen. Prueba con otra foto (JPEG o PNG).', {
        cause: err,
      })
    }
  }

  let img: DecodedImage
  try {
    img = await decodeImage(decodable)
  } catch (err) {
    // Ni `createImageBitmap` ni `<img>.decode()` pudieron con el archivo.
    // Reportamos para tener visibilidad del formato problemático en Sentry.
    reportError(err, {
      area: 'image_decode',
      stage: 'decode',
      fileType: file.type || '(vacío)',
      fileSizeKb: Math.round(file.size / 1024),
      fileName: file.name,
    })
    throw err
  }
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

/**
 * Recorta la imagen a un cuadrado centrado y la re-exporta a JPEG de lado
 * AVATAR_SIDE. Como `compressAndStripExif`, pasa por canvas, así que descarta el
 * EXIF (orientación y GPS) y reusa la conversión de HEIC del pipeline general.
 */
async function squareCropToJpeg(file: File): Promise<Blob> {
  let decodable = file
  if (isHeic(file)) {
    try {
      decodable = await heicToJpeg(file)
    } catch (err) {
      reportError(err, {
        area: 'image_decode',
        stage: 'heic_convert',
        fileType: file.type || '(vacío)',
        fileSizeKb: Math.round(file.size / 1024),
        fileName: file.name,
      })
      throw new Error('No se pudo leer la imagen. Prueba con otra foto (JPEG o PNG).', {
        cause: err,
      })
    }
  }

  let img: DecodedImage
  try {
    img = await decodeImage(decodable)
  } catch (err) {
    reportError(err, {
      area: 'image_decode',
      stage: 'decode',
      fileType: file.type || '(vacío)',
      fileSizeKb: Math.round(file.size / 1024),
      fileName: file.name,
    })
    throw err
  }
  try {
    // Cuadrado centrado: tomamos el lado corto y descartamos los bordes del lado
    // largo (mitad a cada lado) para que la foto quede centrada en el círculo.
    const side = Math.min(img.width, img.height)
    const sx = (img.width - side) / 2
    const sy = (img.height - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIDE
    canvas.height = AVATAR_SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen.')
    ctx.drawImage(img.source, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
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

/**
 * Recorta a cuadrado, comprime/estripa EXIF y sube la foto de perfil al bucket
 * PÚBLICO `avatars`. Devuelve la URL pública ESTABLE para guardar en
 * `profiles.avatar_url` (se muestra en clasificación, mapa, etc.).
 *
 * Ruta `<userId>/<uuid>.jpg`: la política de escritura solo permite al propio
 * usuario tocar su carpeta (primer segmento = auth.uid()). Un uuid nuevo en cada
 * subida evita la caché del CDN al cambiar de foto (no hay que invalidar).
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const blob = await squareCropToJpeg(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw error
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
