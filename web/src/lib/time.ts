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

/**
 * Tiempo de RESPUESTA de un jugador (`votes.elapsed_seconds`) para la leyenda
 * del resultado (issue #811): "12 s" bajo el minuto, "1 m 05 s" a partir de un
 * minuto (segundos con cero a la izquierda — lectura tabular en la columna).
 * `null` (voto legado sin cronómetro, o reto sin límite de tiempo) → "—",
 * nunca "0 s": sería un dato inventado que no se midió.
 */
export function fmtElapsed(seconds: number | null): string {
  if (seconds == null) return '—'
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes} m ${secs.toString().padStart(2, '0')} s`
}

// Fecha+hora ABSOLUTA en español, instanciada una sola vez (mismo patrón que
// `dateFmt`/`longFmt` en MomentCard/TripWrap): coste de parseo de Intl una vez,
// no en cada llamada.
const DEADLINE_DATETIME_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Fecha y hora ABSOLUTA de un plazo ("6 de julio, 18:30"), a diferencia de
 * `formatDeadline` (cuenta atrás RELATIVA, "quedan 3 h"). Sirve para mostrar
 * "Cierra el …"/"Cerró el …" al editar el plazo (issue: editar reto — ajustar
 * la fecha), donde el dueño necesita el instante concreto, no un contador.
 */
export function formatDeadlineDateTime(iso: string): string {
  return DEADLINE_DATETIME_FMT.format(new Date(iso))
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
