/// <reference types="google.maps" />
// Encaje de un punto al panorama de Street View más cercano. El pivote (ver
// docs/estrategia/pivote-streetview.md) sustituye la foto por un panorama: al
// crear el reto encajamos el lat/lng elegido al panorama real más próximo y nos
// quedamos con su pano_id, robusto frente a reorganizaciones de cobertura.

import { haversine } from './geo'

export interface PanoramaMatch {
  panoId: string
  lat: number
  lng: number
}

/** Panorama encajado + a qué distancia (en metros) cayó del punto buscado. */
export interface PanoramaNearby extends PanoramaMatch {
  /** Distancia del panorama al punto original, en metros (redondeada). */
  distanceMeters: number
}

// Tiempo máximo que esperamos a que la búsqueda de Street View responda antes de
// darla por "sin cobertura". CLAVE PARA LA ROBUSTEZ: si la Maps JS API se NIEGA en
// el navegador (p.ej. la clave está restringida por dominio y este dominio no está
// en la lista de referrers), `importLibrary`/`getPanorama` pueden COLGARSE —ni
// resuelven ni rechazan—. Sin este tope, `checkingPano` se quedaría en `true` para
// siempre y el flujo de crear se atascaría (no se puede avanzar ni lanzar). Con él,
// un cuelgue degrada a `null` = "sin Street View" y el reto se crea igual con foto.
const STREET_VIEW_TIMEOUT_MS = 8000

// Rechaza si `promise` no se resuelve dentro de `ms`. El temporizador se limpia al
// asentarse la promesa (éxito o fallo) para no dejar handles colgando en tests.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('street_view_timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

// Carga la librería 'streetView' del SDK ya inicializado por <APIProvider>.
// Devolvemos la clase StreetViewService para instanciarla bajo demanda.
async function loadStreetViewLibrary(): Promise<google.maps.StreetViewLibrary> {
  // google.maps.importLibrary lo expone el loader de @vis.gl/react-google-maps
  // una vez montado el APIProvider. En componentes preferimos useMapsLibrary,
  // pero aquí (lib pura) lo pedimos directamente al objeto global ya cargado. Si el
  // SDK no se cargó (bloqueado/negado), `google` puede no existir: lo tratamos como
  // fallo (lo captura el try/catch de `findPanorama` → "sin Street View").
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
  try {
    // Todo el trabajo del SDK (cargar la librería + la consulta) va bajo un tope de
    // tiempo: si la Maps JS API se niega en el navegador, esto puede colgarse, y un
    // cuelgue NUNCA debe atascar el flujo de crear (degradamos a "sin Street View").
    return await withTimeout(
      (async () => {
        const lib = await loadStreetViewLibrary()
        const service = new lib.StreetViewService()
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
      })(),
      STREET_VIEW_TIMEOUT_MS,
    )
  } catch {
    // ZERO_RESULTS (sin cobertura) llega como promesa rechazada en la API moderna;
    // el timeout y un `google` ausente (SDK bloqueado) también caen aquí. Cualquier
    // fallo de búsqueda lo tratamos como "no hay panorama" para no bloquear crear.
    return null
  }
}

/**
 * Busca el panorama de Street View cercano a un punto y reporta a qué distancia
 * cayó. Pensado para el flujo Fácil: la FOTO es la respuesta (su lat/lng), y el
 * Street View es contexto explorable que puede estar a unos metros. Si el
 * panorama queda lejos avisamos al creador antes de usarlo.
 *
 * @param lat latitud del punto (la respuesta: GPS de la foto o pin manual)
 * @param lng longitud del punto
 * @param radius radio de búsqueda en metros (default 50; criterio del flujo Fácil)
 * @returns el panorama encajado + su distancia en metros, o `null` si no hay
 *   cobertura de Street View en ese radio.
 */
export async function findPanoramaNear(
  lat: number,
  lng: number,
  radius = 50,
): Promise<PanoramaNearby | null> {
  const match = await findPanorama(lat, lng, radius)
  if (!match) return null
  const km = haversine({ lat, lng }, { lat: match.lat, lng: match.lng })
  return { ...match, distanceMeters: Math.round(km * 1000) }
}
