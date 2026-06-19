/// <reference types="google.maps" />
// Encaje de un punto al panorama de Street View más cercano. El pivote (ver
// docs/estrategia/pivote-streetview.md) sustituye la foto por un panorama: al
// crear el reto encajamos el lat/lng elegido al panorama real más próximo y nos
// quedamos con su pano_id, robusto frente a reorganizaciones de cobertura.

export interface PanoramaMatch {
  panoId: string
  lat: number
  lng: number
}

// Carga la librería 'streetView' del SDK ya inicializado por <APIProvider>.
// Devolvemos la clase StreetViewService para instanciarla bajo demanda.
async function loadStreetViewLibrary(): Promise<google.maps.StreetViewLibrary> {
  // google.maps.importLibrary lo expone el loader de @vis.gl/react-google-maps
  // una vez montado el APIProvider. En componentes preferimos useMapsLibrary,
  // pero aquí (lib pura) lo pedimos directamente al objeto global ya cargado.
  return (await google.maps.importLibrary('streetView')) as google.maps.StreetViewLibrary
}

/**
 * Busca el panorama de Street View más cercano a un punto.
 *
 * @param lat latitud del punto elegido por el creador
 * @param lng longitud del punto elegido por el creador
 * @param radius radio de búsqueda en metros (default 80; el panorama puede caer
 *   en la calle más cercana, no en el punto exacto)
 * @returns la posición encajada al panorama (panoId + lat/lng) o `null` si no
 *   hay cobertura de Street View en ese radio.
 */
export async function findPanorama(
  lat: number,
  lng: number,
  radius = 80,
): Promise<PanoramaMatch | null> {
  const lib = await loadStreetViewLibrary()
  const service = new lib.StreetViewService()
  try {
    const { data } = await service.getPanorama({
      location: { lat, lng },
      radius,
      // NEAREST: el panorama físicamente más próximo al punto (no el "más
      // representativo"); queremos lo que de verdad rodea al sitio elegido.
      preference: lib.StreetViewPreference.NEAREST,
    })
    const panoId = data.location?.pano
    const pos = data.location?.latLng
    if (!panoId || !pos) return null
    return { panoId, lat: pos.lat(), lng: pos.lng() }
  } catch {
    // ZERO_RESULTS (sin cobertura) llega como promesa rechazada en la API
    // moderna. Cualquier fallo de búsqueda lo tratamos como "no hay panorama".
    return null
  }
}
