// Cuenta atrás compacta para las tarjetas "Te toca jugar" de la home: convierte
// un plazo absoluto (ISO) en el tiempo restante ya formateado (p.ej. "3 h 12 m",
// "8 m", "ahora"). El diseño (cuentas-y-home.md §3.1) pide la cuenta atrás del
// plazo, no la hora absoluta del reto (eso lo da `lib/time.formatDeadline`).
// Función pura para poder testearla con un `now` fijo.

export function formatCountdown(deadlineIso: string, now: Date = new Date()): string {
  const remainingMs = new Date(deadlineIso).getTime() - now.getTime()
  // Plazo agotado: el reto ya no debería aparecer en "te toca jugar", pero por
  // si llega justo en el límite mostramos un cierre suave en vez de negativo.
  if (remainingMs <= 0) return 'cerrando'

  const totalMinutes = Math.floor(remainingMs / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60

  // Por encima de un día mostramos días + horas (los minutos sobran a esa escala).
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return `${hours} h ${minutes} m`
  if (minutes > 0) return `${minutes} m`
  return 'ahora'
}
