// Formatea un plazo (ISO absoluto) en la hora LOCAL de quien lo ve. Así el
// "fin del día" del creador (guardado como instante absoluto) se muestra sin
// ambigüedad de huso: cada persona ve la hora local equivalente.
export function formatDeadline(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)

  if (dayDiff === 0) return `hasta hoy a las ${time}`
  if (dayDiff === 1) return `hasta mañana a las ${time}`
  return `hasta el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} a las ${time}`
}

/** ¿El plazo ya pasó? (reto cerrado, no admite votos). */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}
