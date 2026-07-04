// Plazos de reto como cuenta atrás inequívoca. El plazo se guarda como instante
// absoluto (ISO); aquí lo mostramos como "quedan 3 h 12 m", que no depende del
// huso de quien lo lee (a diferencia del antiguo "hasta hoy/mañana", ambiguo
// entre zonas horarias). Si ya venció → "cerrado".

/** Devuelve el ISO (instante absoluto) de "ahora + `minutes` minutos". Sirve para
 * la duración relativa del reto: el creador elige cuánto dura y congelamos el fin
 * como timestamp absoluto. Permite plazos cortos ("express" de 5/10 min). */
export function deadlineFromMinutes(minutes: number): string {
  const d = new Date()
  d.setTime(d.getTime() + minutes * 60_000)
  return d.toISOString()
}

/** Igual que `deadlineFromMinutes` pero en horas. Se mantiene por compatibilidad
 * con los usos existentes (createChallenge usa una duración por defecto en horas). */
export function deadlineFromNow(hours: number): string {
  return deadlineFromMinutes(hours * 60)
}

/**
 * Cuenta atrás hasta el plazo, en la forma "quedan 3 h 12 m" / "quedan 12 m" /
 * "quedan 45 s". Inequívoca en cualquier huso porque mide una diferencia de
 * instantes, no una hora de pared. Si el plazo ya pasó → "cerrado". Un momento SIN
 * plazo (recuerdo, `iso = null` desde 0022) tampoco tiene cuenta atrás → "cerrado".
 */
export function formatDeadline(iso: string | null): string {
  if (iso == null) return 'cerrado'
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

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parsea la fecha de un MOMENTO (`Moment.date`, lib/trip.ts) a un `Date` sin
 * desplazar el día. Ese valor puede ser de dos naturalezas distintas y cada una
 * necesita un parseo distinto (issue #566, migración 0037 — `happened_on`):
 *  - fecha PURA (`happened_on`, `YYYY-MM-DD`, sin hora ni huso): construimos el
 *    `Date` con componentes LOCALES (año/mes/día). Pasarla por `new Date(str)`
 *    la interpretaría como medianoche UTC y, en husos AL OESTE de UTC, el
 *    `Date` resultante cae en el día ANTERIOR al leerlo con getters locales
 *    (`getFullYear`/`getMonth`/`getDate`) o al formatear sin `timeZone: 'UTC'`.
 *  - instante REAL (`created_at`, ISO completo con hora y huso — momentos legado
 *    sin `happened_on`): aquí SÍ queremos la conversión a huso LOCAL de siempre
 *    (el día que vivió quien lo creó, no el de un servidor en UTC).
 */
export function parseMomentDate(value: string): Date {
  const match = DATE_ONLY_RE.exec(value)
  if (!match) return new Date(value)
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d))
}
