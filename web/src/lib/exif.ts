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
