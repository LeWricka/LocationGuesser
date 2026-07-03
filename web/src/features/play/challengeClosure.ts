import { isPracticeChallenge } from '../../lib/challenges'

// Mini-resumen de estado para la guarda "es tuyo" (#579): "cierra en X" si el
// reto sigue en juego, "cerrado" si ya venció. Pantalla estática e informativa
// (no la jugada, con reloj en vivo) — basta una lectura al montar, sin tic-tac.
// Un reto de PRÁCTICA (plazo a años vista, ver isPracticeChallenge) o un
// recuerdo (deadline null) no tienen un cierre real que anunciar.
export function describeChallengeClosure(deadlineAt: string | null): string {
  if (deadlineAt == null || isPracticeChallenge(deadlineAt)) return 'Sin plazo'
  const remainingMs = new Date(deadlineAt).getTime() - Date.now()
  if (remainingMs <= 0) return 'Cerrado'
  const minutes = Math.round(remainingMs / 60_000)
  if (minutes < 60) return `Cierra en ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `Cierra en ${hours} h`
  const days = Math.round(hours / 24)
  return `Cierra en ${days} d`
}
