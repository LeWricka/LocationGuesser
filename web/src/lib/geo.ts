export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Distancia en km entre dos puntos sobre la esfera (haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(x)))
}

/** Puntos del reto a partir de la distancia: 5000·e^(−km/2000). */
export function scoreFor(km: number): number {
  return Math.max(0, Math.round(5000 * Math.exp(-km / 2000)))
}

/** Formatea una distancia en km a texto legible (m / km). */
export function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
