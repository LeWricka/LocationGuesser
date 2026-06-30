import type { RoutePoint } from '../../lib/trip'

/**
 * Dibujado por etapas de la ruta del viaje (modo PLAY). Devuelve cuántos puntos de la
 * ruta forman ya el tramo RECORRIDO (oro sólido): el resto queda pendiente (oro tenue).
 *
 * - En reposo (`playing=false`) o sin selección → la ruta entera está recorrida
 *   (`route.length`): se ve completa, no por etapas.
 * - En play → hasta el momento seleccionado, INCLUSIVE (índice + 1). Si el seleccionado
 *   no es un punto de la ruta (p.ej. el momento activo, que no se clava), no hay corte:
 *   se ve entera (evita "borrar" la ruta al seleccionar algo fuera de ella).
 *
 * Lógica pura y compartida por los dos motores de mapa (plano y globo) para que el
 * dibujado coincida sea cual sea el motor, y testeable sin montar un mapa.
 */
export function drawnRouteCount(
  route: RoutePoint[],
  selectedChallengeId: string | null,
  playing: boolean,
): number {
  if (!playing || !selectedChallengeId) return route.length
  const idx = route.findIndex((p) => p.challengeId === selectedChallengeId)
  return idx < 0 ? route.length : idx + 1
}
