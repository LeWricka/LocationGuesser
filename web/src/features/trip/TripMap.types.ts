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
  /**
   * ¿Está el viaje VISIBLE? (keep-alive del último viaje, issue #979). Por defecto
   * `true`. Con `active={false}` el viaje sigue MONTADO pero oculto (`display:none`):
   * el motor detiene cualquier animación de cámara en vuelo y NO reencuadra. Al volver
   * a `active={true}` revalida el tamaño del lienzo (MapLibre `resize()` / Leaflet
   * `invalidateSize()`, que tras un `display:none` no se recalculan solos) para
   * reaparecer EN LA MISMA cámara, sin flash ni re-init.
   */
  active?: boolean
}
