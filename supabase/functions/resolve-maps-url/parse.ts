// Parser puro de coordenadas a partir de una URL de Google Maps.
// Se mantiene aparte de index.ts para poder testearlo sin levantar el servidor.

export interface LatLng {
  lat: number;
  lng: number;
}

// Rango válido de coordenadas geográficas.
function esLatLngValida(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Extrae lat/lng de una URL larga de Google Maps.
 * Prueba, en orden, los formatos más fiables primero:
 *   1. `@<lat>,<lng>`            -> centro del mapa
 *   2. `!3d<lat>!4d<lng>`        -> coordenadas del pin (data=...)
 *   3. `q=<lat>,<lng>` / `query=<lat>,<lng>` / `ll=<lat>,<lng>`
 *   4. `<lat>,<lng>` suelto en cualquier parte de la URL
 * Devuelve null si no encuentra un par de coordenadas válido.
 */
export function parseLatLng(url: string): LatLng | null {
  if (!url || typeof url !== "string") return null;

  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";

  const patrones: RegExp[] = [
    // 1. @lat,lng (admite zoom opcional detrás: @lat,lng,15z)
    new RegExp(`@${num},${num}`),
    // 2. !3dlat!4dlng
    new RegExp(`!3d${num}!4d${num}`),
    // 3. parámetros de query habituales
    new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=${num},${num}`),
  ];

  for (const re of patrones) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (esLatLngValida(lat, lng)) return { lat, lng };
    }
  }

  // 4. Último recurso: cualquier par "lat,lng" suelto en la URL.
  // Recorremos todas las coincidencias y nos quedamos con la primera válida.
  const suelto = new RegExp(`${num},${num}`, "g");
  for (const m of url.matchAll(suelto)) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (esLatLngValida(lat, lng)) return { lat, lng };
  }

  return null;
}
