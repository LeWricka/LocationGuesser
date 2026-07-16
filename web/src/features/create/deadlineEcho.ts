// Echo del cierre ABSOLUTO del plazo elegido ("Cierra mañana a las 10:23").
// Nace de un lío real de los primeros usuarios: la opción "Hoy" (720 min = 12 h
// fijas) no decía si era 24 h o hasta el final del día — y de hecho no era
// ninguna de las dos. La etiqueta pasó a "12 h" y ESTE echo remata la duda para
// TODAS las opciones: se elige en relativo, se confirma en absoluto. Función
// pura (recibe `now`) para testear sin relojes.

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function describeDeadlineEcho(minutes: number, now: Date = new Date()): string {
  const close = new Date(now.getTime() + minutes * 60_000)
  const hm = `${String(close.getHours()).padStart(2, '0')}:${String(close.getMinutes()).padStart(2, '0')}`
  if (close.toDateString() === now.toDateString()) return `Cierra hoy a las ${hm}`
  const manana = new Date(now)
  manana.setDate(now.getDate() + 1)
  if (close.toDateString() === manana.toDateString()) return `Cierra mañana a las ${hm}`
  return `Cierra el ${DIAS[close.getDay()]} ${close.getDate()} a las ${hm}`
}
