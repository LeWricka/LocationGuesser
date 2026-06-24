// Lógica pura del reloj de la fase de jugar. Aislada del componente para poder
// testear el cálculo del tiempo restante al reanudar (salir y reentrar a media
// jugada): el reto sigue corriendo desde el instante original, no se reinicia.

/**
 * Segundos restantes de la cuenta atrás, reconstruidos desde el instante en que
 * se pulsó Empezar (`startAtMs`). Al salir y reentrar el reloj NO se reinicia:
 * se calcula contra `now` y el origen persistido, así que el tiempo sigue
 * corriendo mientras el jugador estaba fuera. Nunca devuelve negativo.
 */
export function remainingSeconds(totalSeconds: number, startAtMs: number, nowMs: number): number {
  const elapsed = Math.floor((nowMs - startAtMs) / 1000)
  return Math.max(0, totalSeconds - elapsed)
}
