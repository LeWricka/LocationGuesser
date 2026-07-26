import type { LatLng } from './geo'

// Lectura del GPS del EXIF de una foto. La foto se sube SIEMPRE sin EXIF
// (compressAndStripExif en storage.ts), así que el GPS hay que leerlo del File
// ORIGINAL antes de estripar. Si la foto trae coordenadas, esa es la respuesta
// del reto (un pin que el creador puede ajustar); si no, se coloca a mano.
//
// `exifr` se importa de forma dinámica para no engordar el bundle inicial: solo
// se carga cuando el creador adjunta una foto (flujo Fácil/Difícil). La función
// nunca lanza: sin EXIF, sin GPS o formato raro devuelve null.

/**
 * Valida que un par lat/lng sea geográficamente plausible. Algunas cámaras
 * escriben (0,0) o valores fuera de rango cuando no hay fix de GPS: los
 * tratamos como "sin ubicación" para no colocar el pin en el Golfo de Guinea.
 */
function isPlausible(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  // (0,0) es el "Null Island": casi siempre un GPS sin fix, no una foto real ahí.
  if (lat === 0 && lng === 0) return false
  return true
}

/**
 * Extrae lat/lng del EXIF de un archivo de imagen. Devuelve null si la foto no
 * tiene EXIF, no tiene GPS, las coordenadas no son plausibles o el parseo falla
 * por cualquier motivo (formato raro, archivo no-imagen, etc.). Nunca lanza.
 */
export async function readGpsFromExif(file: File): Promise<LatLng | null> {
  try {
    // Import dinámico: exifr solo entra al bundle cuando de verdad se adjunta foto.
    const exifr = (await import('exifr')).default
    // `gps` lee únicamente el bloque GPS (más rápido y robusto que parsear todo).
    const gps = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | undefined
    if (!gps || gps.latitude == null || gps.longitude == null) return null
    const lat = gps.latitude
    const lng = gps.longitude
    if (!isPlausible(lat, lng)) return null
    return { lat, lng }
  } catch {
    // Sin EXIF, formato no soportado o cualquier fallo de parseo: no hay GPS.
    return null
  }
}

/** Metadatos de captura de una foto leídos de su EXIF (issue #950). */
export interface PhotoExifMeta {
  /** Fecha/hora de captura (DateTimeOriginal, o CreateDate si falta), ISO 8601; null sin EXIF de fecha. */
  takenAt: string | null
  lat: number | null
  lng: number | null
}

/**
 * Extrae la fecha de captura y el GPS del EXIF del archivo ORIGINAL de una foto
 * de galería (recuerdo), para guardarlos en BD (`moment_images.taken_at` /
 * `gps_lat` / `gps_lng`) y poder ordenar la galería por fecha de captura en vez
 * de por orden de subida — el EXIF se pierde al comprimir a canvas
 * (`compressAndStripExif` en `storage.ts`), así que hay que leerlo ANTES.
 *
 * Nota: EXIF `DateTimeOriginal`/`CreateDate` NO llevan zona horaria (es la hora
 * local de la cámara, sin offset). Guardamos el instante tal cual lo
 * interpreta `exifr` (como si fuera hora local de quien procesa el archivo);
 * no es matemáticamente exacto entre husos horarios, pero es el mismo dato que
 * ya usa el resto de la industria y basta para ORDENAR fotos de un mismo viaje.
 *
 * Nunca lanza: sin EXIF, sin esas etiquetas, GPS no plausible o cualquier fallo
 * de parseo devuelve los campos correspondientes a null.
 */
export async function readPhotoMetaFromExif(file: File): Promise<PhotoExifMeta> {
  let takenAt: string | null = null
  let lat: number | null = null
  let lng: number | null = null
  try {
    // Import dinámico: mismo criterio que readGpsFromExif (no engordar el bundle inicial).
    const exifr = (await import('exifr')).default
    const tags = (await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])) as
      | { DateTimeOriginal?: unknown; CreateDate?: unknown }
      | undefined
    const rawDate = tags?.DateTimeOriginal ?? tags?.CreateDate
    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      takenAt = rawDate.toISOString()
    }
  } catch {
    // Sin EXIF, formato no soportado o fallo de parseo: sin fecha de captura.
  }
  try {
    const gps = await readGpsFromExif(file)
    if (gps) {
      lat = gps.lat
      lng = gps.lng
    }
  } catch {
    // readGpsFromExif ya no lanza, pero por si acaso: sin GPS.
  }
  return { takenAt, lat, lng }
}
