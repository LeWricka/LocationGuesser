// Datos del MAPAMUNDI de la home (variante A "el globo"): cada viaje (grupo) es su
// propia CONSTELACIÓN de puntos sobre el globo satélite —sus pines + una mini-ruta
// que une SOLO sus puntos, nunca a otro viaje—. Es PRESENTACIÓN derivada: aquí solo
// orquestamos `lib/tripCover` (momentos visibles + portada canónica, compartida con
// la invitación al viaje, #619) y `signedImageUrl`, y lo traducimos a la forma que
// consume el mapa de la home.
//
// REGLA ANTI-SPOILER (aplicada en `lib/tripCover`): un punto solo aparece si su
// coordenada es VISIBLE —el lugar de un RECUERDO (`place_lat`/`place_lng`) o la
// respuesta de un reto YA CERRADO (vía `getAnswers`, que la RLS solo sirve para
// cerrados/ya votados)—. Un reto ABIERTO no aporta punto: revelaría dónde es.
//
// REGLA: tolerante a fallo y barato. Cada viaje se resuelve por separado con
// Promise.allSettled; un viaje que falle (RLS, red) simplemente no aporta puntos
// (sigue como portada en "Tus viajes"). Nunca rompe la home.

import { useEffect, useState } from 'react'
import { resolveVisibleTripMoments, pickTripCoverImagePath } from '../../lib/tripCover'
import { signedImageUrl } from '../../lib/storage'
import { haversine } from '../../lib/geo'

// `isValidLatLng` vive ahora en `lib/tripCover` (compartida con la invitación al
// viaje, #619); se re-exporta aquí para no romper a quien la importe desde este
// módulo (p.ej. `useWorldTrips.test.ts`).
export { isValidLatLng } from '../../lib/tripCover'

/** Un punto situado de un viaje (un momento con coordenada visible). */
export interface TripPoint {
  /** Id del reto/recuerdo (clave estable del pin; el click abre el viaje). */
  id: string
  lat: number
  lng: number
  /** Título del momento (alt del pin). */
  title: string
  /** URL firmada de la miniatura del pin, o null (cae a un marcador genérico). */
  imageUrl: string | null
  /** Fecha del momento en ISO (orden cronológico de la mini-ruta). */
  date: string
}

/** Un viaje como clúster en el globo: su portada + sus puntos (su propia ruta). */
export interface WorldTrip {
  /** Id del grupo: el click en cualquier pin del clúster abre este viaje. */
  groupId: string
  /** Nombre del viaje (etiqueta del clúster + alt). */
  name: string
  /** Portada del viaje (foto del momento representativo), o null. */
  coverUrl: string | null
  /** Puntos situados del viaje, en orden cronológico ASC (la mini-ruta los cose). */
  points: TripPoint[]
}

export interface WorldData {
  /** Un clúster por viaje con al menos un punto situado. Vacío hasta resolver el lote. */
  trips: WorldTrip[]
  /** Suma de km de todas las mini-rutas (tramos dentro de cada viaje), para el caption. */
  totalKm: number
  loading: boolean
}

const EMPTY: WorldData = { trips: [], totalKm: 0, loading: true }

/** Firma el path de una foto a URL; null si no hay path o si falla (no rompe el pin). */
async function signOrNull(imagePath: string | null | undefined): Promise<string | null> {
  if (!imagePath) return null
  try {
    return await signedImageUrl(imagePath)
  } catch {
    return null
  }
}

/**
 * Resuelve TODOS los puntos visibles de un grupo (su constelación) + su portada.
 * Recorre los momentos del viaje:
 *  - RECUERDO con lugar visible (`place_lat`/`place_lng`) → punto.
 *  - RETO CERRADO con respuesta visible (`getAnswers`) → punto.
 *  - RETO ABIERTO → se omite (anti-spoiler).
 * La portada es la foto del momento situado MÁS RECIENTE (o la primera con foto).
 * Si el viaje no aporta ningún punto situado, devuelve null (no pinta clúster, pero
 * sigue listado como portada en "Tus viajes").
 */
async function resolveTrip(groupId: string, name: string): Promise<WorldTrip | null> {
  // `raw` viene DESC (más reciente primero, ver contrato en lib/tripCover).
  const raw = await resolveVisibleTripMoments(groupId)
  if (raw.length === 0) return null

  // Portada: mismo criterio que usa la invitación al viaje (#619).
  const coverUrl = await signOrNull(pickTripCoverImagePath(raw))

  // Firmamos las miniaturas de los pines en paralelo (cada una tolerante a fallo).
  const points: TripPoint[] = await Promise.all(
    raw.map(async (r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      title: r.title,
      imageUrl: await signOrNull(r.image_path),
      date: r.created_at,
    })),
  )
  // Orden cronológico ASC para la mini-ruta (el recorrido del viaje en el tiempo).
  points.sort((a, b) => a.date.localeCompare(b.date))

  return { groupId, name, coverUrl, points }
}

/** Suma de los tramos consecutivos (km) DENTRO de un viaje (su mini-ruta). */
function tripKm(points: TripPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i])
  return total
}

/**
 * Hook del mapamundi (variante A): dado el listado de viajes del usuario (id + nombre),
 * resuelve en LOTE la constelación de cada viaje (sus puntos visibles + portada).
 * Tolerante a fallo (allSettled): los viajes que no resuelvan se omiten del globo sin
 * afectar al resto. La lista de viajes la ha cargado ya la home; esto añade las coords.
 */
export function useWorldTrips(groups: { id: string; name: string }[]): WorldData {
  const [data, setData] = useState<WorldData>(EMPTY)
  // Clave estable del conjunto de grupos: re-resolvemos solo si cambia la lista.
  const key = groups.map((g) => g.id).join(',')

  useEffect(() => {
    if (groups.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado terminal sin grupos
      setData({ trips: [], totalKm: 0, loading: false })
      return
    }
    let cancelled = false
    void (async () => {
      const settled = await Promise.allSettled(groups.map((g) => resolveTrip(g.id, g.name)))
      if (cancelled) return
      const trips = settled
        .filter((r): r is PromiseFulfilledResult<WorldTrip | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((t): t is WorldTrip => t !== null)
      const totalKm = Math.round(trips.reduce((sum, t) => sum + tripKm(t.points), 0))
      setData({ trips, totalKm, loading: false })
    })()
    return () => {
      cancelled = true
    }
    // `key` resume la lista de grupos; `groups` se re-lee dentro (no re-dispara solo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return data
}
