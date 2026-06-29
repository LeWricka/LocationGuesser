import { useMemo } from 'react'
import { TripMap } from '../trip/TripMap'
import { tripsToRoute, type WorldTrip } from './useWorldTrips'
import styles from './HomeWorldMap.module.css'

interface Props {
  /** Viajes con coordenada resuelta (un pin-foto por viaje). */
  trips: WorldTrip[]
  /** Nº de viajes del usuario (para el caption; puede ser > trips.length si alguno no situó). */
  tripCount: number
  /** Km recorridos sumando los tramos entre viajes (caption). */
  totalKm: number
  /** Cargando las coordenadas: mostramos el lienzo sin pines aún (no rompe nada). */
  loading: boolean
  /** Abrir un viaje al tocar su pin. */
  onOpenTrip: (groupId: string) => void
}

// Formatea km con separador de millares español (14.870), tabular en CSS.
function formatKm(km: number): string {
  return km.toLocaleString('es-ES')
}

/**
 * MAPAMUNDI satélite de la home (héroe visual de la fase "nuevo enfoque"): reusa la
 * infraestructura de mapa del viaje (`TripMap` → globo MapLibre satélite con red de
 * seguridad Leaflet) clavando UN pin-foto por viaje del usuario. El click en un pin
 * abre ese viaje. Sobre el lienzo, un caption editorial con el recuento de recuerdos.
 *
 * Pintamos pines REALES (coordenada de un reto cerrado por grupo) cuando se resuelven;
 * mientras cargan, el globo se ve igualmente (atlas vivo), sin pines. Nunca decorativo
 * inventado: si un viaje no aporta coordenada, no pinta pin (sigue en "Tus viajes").
 */
export function HomeWorldMap({ trips, tripCount, totalKm, loading, onOpenTrip }: Props) {
  // El mapa de viaje espera RoutePoint[]; el "challengeId" de cada punto es el groupId,
  // así que onSelectMoment nos devuelve directamente el viaje a abrir.
  const route = useMemo(() => tripsToRoute(trips), [trips])

  const tripsLabel = tripCount === 1 ? '1 viaje' : `${tripCount} viajes`

  return (
    <section className={styles.wrap} aria-label="Mapa de tus viajes">
      <div className={styles.frame}>
        <TripMap
          route={route}
          activeMoment={null}
          selectedChallengeId={null}
          onSelectMoment={onOpenTrip}
        />
        <div className={styles.caption} aria-hidden={loading}>
          <p className={styles.captionName}>{tripsLabel}</p>
          {totalKm > 0 && <p className={styles.captionMeta}>{formatKm(totalKm)} km recorridos</p>}
        </div>
      </div>
    </section>
  )
}
