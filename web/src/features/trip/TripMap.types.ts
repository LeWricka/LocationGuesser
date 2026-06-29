/**
 * Contrato PÚBLICO del mapa de la pantalla Viaje. Lo comparten el selector
 * (`TripMap`), el globo 3D (`TripMapGlobe`) y el fallback plano (`TripMapLeaflet`)
 * para que sean intercambiables sin que TripPage note la diferencia. No cambiar
 * sin actualizar a los tres consumidores.
 */
import type { Moment, RoutePoint } from '../../lib/trip'

export interface TripMapProps {
  /** Momentos cerrados con lat/lng, en orden cronológico ASC (la ruta a coser). */
  route: RoutePoint[]
  /** Momento en juego (si lo hay). NO se clava en su sitio real: flota (anti-spoiler). */
  activeMoment: Moment | null
  /** Momento seleccionado en el carrusel; el mapa hace pan/zoom suave a su pin. */
  selectedChallengeId: string | null
  onSelectMoment: (challengeId: string) => void
}
