import { supabase } from './supabase'

// Fecha de hoy en formato `yyyy-mm-dd` (zona local), para el valor por defecto del
// input date. Compartida por los formularios que fechan un momento/reto (recuerdo,
// reto de lugar, reto de número): todos ordenan el diario por `happened_on`.
export function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// Fecha local (`YYYY-MM-DD`) de un timestamp ISO cualquiera, con el mismo criterio
// de zona horaria que `todayIso` (evita el desfase de "un día antes" que da
// `.toISOString()` directo sobre un timestamp UTC cerca de medianoche local).
function localDateFromIso(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// `latestMomentDate` (más abajo) puede ser un `happened_on` PURO (`YYYY-MM-DD`,
// migración 0037/#566: ya es el día exacto elegido, sin hora ni huso) o, para un
// momento legado sin fecha propia, un `created_at` ISO completo (con hora y huso,
// necesita `localDateFromIso`). Pasar un `happened_on` por `localDateFromIso`
// sería un error: lo interpretaría como medianoche UTC y, en husos AL OESTE de
// UTC, restaría un día.
function toLocalDateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateFromIso(value)
}

/**
 * Fecha por defecto del campo "Fecha" + tope superior del calendario, en cascada
 * (issue #553 — el dueño de un viaje pasado, sept 2024, tenía que navegar el
 * calendario desde hoy hasta esa fecha en CADA recuerdo nuevo; reutilizada por
 * los asistentes de crear reto para que el reto también quede bien ordenado en
 * el diario por `happened_on` en vez de por cuándo se creó):
 *  1. Si el viaje ya tiene momentos → la fecha del MÁS RECIENTE (`happened_on` si
 *     lo tiene —migración 0037, la fuente REAL de la fecha elegida— o su
 *     `created_at` como proxy en momentos legado; ver `fetchLatestMomentDate` y
 *     `Moment.date` en `lib/trip.ts`, mismo criterio que ordena el diario).
 *     OJO: el proxy `created_at` (solo momentos legado) es fiable únicamente
 *     cuando el diario se documentó EN VIVO. Si el viaje tiene fechas y la fecha
 *     derivada cae FUERA de [starts_on, ends_on ?? starts_on], es un artefacto de
 *     backfill — el caso real del dueño: viaje de sept 2024 rellenado HOY; el
 *     primer recuerdo (legado, sin `happened_on`) se crea hoy, así que su
 *     `created_at` anclaría el SEGUNDO recuerdo en hoy y el dolor original
 *     reaparecería. En ese caso la ignoramos y caemos a la regla 2 (que para un
 *     viaje pasado da `starts_on`). Con `happened_on` (momentos nuevos) este
 *     artefacto ya no debería darse, pero el guardarraíl no estorba y cubre el
 *     viaje mixto (legado + nuevo).
 *  2. Si no hay momentos (o su fecha cayó fuera del rango) pero el viaje
 *     tiene fechas (`starts_on`/`ends_on`, migración 0027) → hoy ACOTADO al
 *     rango: si hoy cae dentro, hoy; si el viaje es pasado o futuro (hoy fuera
 *     del rango), `starts_on`.
 *  3. Sin momentos ni fechas del viaje → hoy (comportamiento de siempre).
 * Tope superior: por defecto hoy (no se crean recuerdos/retos "futuros" sueltos).
 * Si el viaje es FUTURO y tiene `ends_on`, lo ampliamos hasta ahí — si no,
 * `max=hoy` bloquearía cualquier fecha del propio viaje (planificar con
 * antelación dentro de su rango). Sin `ends_on` nos quedamos en `max=hoy` (no hay
 * tope al que ampliar).
 */
export function computeDefaultDate(
  latestMomentDate: string | null,
  startsOn: string | null,
  endsOn: string | null,
  today: string,
): { date: string; max: string } {
  const isFutureTrip = startsOn != null && startsOn > today
  const max = isFutureTrip && endsOn ? endsOn : today

  if (latestMomentDate) {
    const latestDate = toLocalDateOnly(latestMomentDate)
    // Regla 1 solo si la fecha del último momento es plausible: sin fechas del
    // viaje (nada con qué contrastar) o dentro del rango. Fuera del rango es un
    // artefacto de backfill (ver comentario de arriba) → cae a la regla 2.
    const plausible = !startsOn || (latestDate >= startsOn && latestDate <= (endsOn ?? startsOn))
    if (plausible) return { date: latestDate, max }
  }
  if (startsOn) {
    const withinRange = today >= startsOn && today <= (endsOn ?? startsOn)
    return { date: withinRange ? today : startsOn, max }
  }
  return { date: today, max }
}

/**
 * Fecha del momento (recuerdo o reto) más reciente del viaje — mismo criterio que
 * usa el diario para ordenar y fechar (`happened_on` con fallback `created_at`,
 * migración 0037/#566; ver `Moment.date` en `lib/trip.ts`). Consulta mínima (dos
 * columnas, una fila): solo ancla la fecha por defecto del formulario, no duplica
 * el fetch pesado de `getGroupChallenges` (todas las columnas, todo el viaje) que
 * ya hace la pantalla del viaje.
 */
export async function fetchLatestMomentDate(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('happened_on, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data.happened_on ?? data.created_at
}
