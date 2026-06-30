// Formatea el rango de fechas del viaje para el resumen ("12 – 26 oct 2026 ·
// 14 días"). Entrada en 'YYYY-MM-DD' (como devuelve <input type="date"> y guarda
// la BD). Pura y sin dependencias: fácil de testear. Devuelve null si no hay
// ninguna fecha (el resumen muestra "Sin fechas").

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Parte 'YYYY-MM-DD' en partes numéricas, o null si no es válida. Trabajamos con
 * los números crudos (no `new Date`) para no arrastrar zona horaria: una fecha de
 * calendario no tiene hora. */
function parts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function dayMonth(p: { m: number; d: number }): string {
  return `${p.d} ${MESES[p.m - 1]}`
}

/** Nº de noches/días inclusive entre dos fechas (mismo día = 1 día). */
function inclusiveDays(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): number {
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)
  return Math.round(ms / 86_400_000) + 1
}

/**
 * Resumen humano del rango de fechas del viaje.
 * - Sin fechas → null.
 * - Solo salida → "Desde el 12 oct 2026".
 * - Solo vuelta → "Hasta el 26 oct 2026".
 * - Rango → "12 – 26 oct 2026 · 14 días" (o con dos años si cambia el año).
 * Si el rango viene invertido (fin antes que inicio) lo enderezamos, igual que
 * `buildGroupInsert`.
 */
export function formatTripDates(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
): string | null {
  let start = parts(startsOn)
  let end = parts(endsOn)

  if (start && end) {
    // Rango invertido → intercambiar.
    if (Date.UTC(end.y, end.m - 1, end.d) < Date.UTC(start.y, start.m - 1, start.d)) {
      ;[start, end] = [end, start]
    }
    const days = inclusiveDays(start, end)
    const dayWord = days === 1 ? 'día' : 'días'
    if (start.y === end.y) {
      return `${dayMonth(start)} – ${dayMonth(end)} ${start.y} · ${days} ${dayWord}`
    }
    return `${dayMonth(start)} ${start.y} – ${dayMonth(end)} ${end.y} · ${days} ${dayWord}`
  }
  if (start) return `Desde el ${dayMonth(start)} ${start.y}`
  if (end) return `Hasta el ${dayMonth(end)} ${end.y}`
  return null
}
