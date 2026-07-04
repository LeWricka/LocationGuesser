// Orden del carrusel de la home, en su propio módulo (no en HomeDashboard.tsx: la
// regla react-refresh prohíbe exportar funciones desde ficheros de componentes).
// Lo comparten HomeDashboard (ordena el feed) y HomePage (#700: necesita saber cuál
// será el PRIMER viaje del carrusel — el protagonista — para marcar el "lead" de su
// momento más reciente en los pines del globo). Una única fuente de verdad del
// criterio, sin duplicarlo.

import type { GroupStatus } from './GroupCard'
import type { HomeGroup } from './HomeDashboard'

// PRIMERO los viajes que piden acción (te toca → en juego), luego el resto por más
// reciente. Así lo que urge queda más a mano (el reto concreto, además, va fijado en
// el chip de vidrio flotante).
function actionRank(status: GroupStatus): number {
  if (status === 'toplay') return 0 // te toca jugar
  if (status === 'live') return 1 // hay reto abierto
  return 2 // sin acción pendiente
}

export function sortTrips(list: HomeGroup[]): HomeGroup[] {
  return [...list].sort(
    (a, b) =>
      actionRank(a.status) - actionRank(b.status) ||
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )
}
