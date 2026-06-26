// Formateadores de la vista de admin. Puros (sin React/Supabase): fáciles de
// testear. Todos tratan null/undefined como guion "—" para que la UI no muestre
// "NaN" ni "null" cuando una métrica no aplica (p.ej. grupo sin retos).

const DASH = '—'

const intFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/** Entero con separador de miles (12.345). Cuentas siempre presentes. */
export function fmtInt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  return intFmt.format(Math.round(value))
}

/** Número con hasta `decimals` decimales (sin ceros de relleno). */
export function fmtNumber(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return DASH
  return value.toLocaleString('es-ES', { maximumFractionDigits: decimals })
}

/** Porcentaje 0–100 con un decimal y sufijo "%" (87,5 %). El valor llega ya en
 * escala 0–100 desde las RPCs (participation_pct, etc.). */
export function fmtPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return DASH
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: decimals })} %`
}

/** Segundos legibles: "45 s" o "2 min 30 s" a partir de un minuto. */
export function fmtSeconds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  const total = Math.round(value)
  if (total < 60) return `${total} s`
  const min = Math.floor(total / 60)
  const sec = total % 60
  return sec > 0 ? `${min} min ${sec} s` : `${min} min`
}

/** Cadencia entre retos: "cada 3,2 días" / "cada 1 día". null → guion. */
export function fmtCadence(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  const days = value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  const unit = value === 1 ? 'día' : 'días'
  return `cada ${days} ${unit}`
}

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Fecha compacta en español ("12 jun 2026"). Inválida/ausente → guion. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  // Intl añade un punto al mes abreviado ("12 jun. 2026"); lo quitamos.
  return dateFmt.format(date).replace('.', '')
}

/** Distancia media en km: "1.234 km" / "12,3 km". null → guion. */
export function fmtKm(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 0 })} km`
}
