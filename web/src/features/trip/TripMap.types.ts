/**
 * Contrato PÚBLICO del mapa de la pantalla Viaje. Lo comparten el selector
 * (`TripMap`), el globo 3D (`TripMapGlobe`) y el fallback plano (`TripMapLeaflet`)
 * para que sean intercambiables sin que TripPage note la diferencia. No cambiar
 * sin actualizar a los tres consumidores.
 */
import type { RoutePoint } from '../../lib/trip'

export interface TripMapProps {
  /** Momentos cerrados con lat/lng, en orden cronológico ASC (la ruta a coser). */
  route: RoutePoint[]
  /** Momento seleccionado en el carrusel; el mapa hace pan/zoom suave a su pin. */
  selectedChallengeId: string | null
  /**
   * ¿Se está reproduciendo el recorrido? En play la ruta se DIBUJA por etapas: el
   * tramo recorrido (hasta el momento seleccionado) va en oro sólido y el pendiente
   * en oro tenue/discontinuo, como en la maqueta. En reposo la ruta se ve entera en
   * oro. Ausente/false = reposo. (Con prefers-reduced-motion no hay play, así que el
   * dibujado por etapas tampoco aplica: se ve la ruta completa.)
   */
  playing?: boolean
  onSelectMoment: (challengeId: string) => void
}
