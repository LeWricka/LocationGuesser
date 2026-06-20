// Plazos de reto como cuenta atrás inequívoca. El plazo se guarda como instante
// absoluto (ISO); aquí lo mostramos como "quedan 3 h 12 m", que no depende del
// huso de quien lo lee (a diferencia del antiguo "hasta hoy/mañana", ambiguo
// entre zonas horarias). Si ya venció → "cerrado".

/** Devuelve el ISO (instante absoluto) de "ahora + `hours` horas". Sirve para la
 * duración relativa del reto: el creador elige cuánto dura y congelamos el fin
 * como timestamp absoluto. */
export function deadlineFromNow(hours: number): string {
  const d = new Date()
  d.setTime(d.getTime() + hours * 3_600_000)
  return d.toISOString()
}

/**
 * Cuenta atrás hasta el plazo, en la forma "quedan 3 h 12 m" / "quedan 12 m" /
 * "quedan 45 s". Inequívoca en cualquier huso porque mide una diferencia de
 * instantes, no una hora de pared. Si el plazo ya pasó → "cerrado".
 */
export function formatDeadline(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'cerrado'

  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return hours > 0 ? `quedan ${days} d ${hours} h` : `quedan ${days} d`
  }
  if (hours > 0) {
    return minutes > 0 ? `quedan ${hours} h ${minutes} m` : `quedan ${hours} h`
  }
  if (minutes > 0) return `quedan ${minutes} m`
  // Menos de un minuto: mostramos segundos para que el último tramo no diga "0 m".
  return `quedan ${Math.max(1, Math.ceil(ms / 1000))} s`
}

/** ¿El plazo ya pasó? (reto cerrado, no admite votos). */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}
