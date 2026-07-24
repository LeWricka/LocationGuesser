import type { Unit } from '../../ui'

// Utilidades del reto de NÚMERO ("¿Cuánto?") compartidas entre crear
// (`CreateNumberChallenge`) y editar (`EditNumberChallenge`, issue #922).
// Viven en un fichero aparte (no en el componente) porque exportar constantes
// o funciones sueltas desde un fichero de componente rompe el fast refresh de
// Vite (`react-refresh/only-export-components`).

// Unidades del número (UnitInput): NO solo €. La unidad va al lado del número.
// `custom` abre un campo libre ≤8 car (la respuesta del rediseño a "solo €").
export const UNIT_OPTIONS: readonly Unit[] = [
  { value: 'eur', symbol: '€', label: 'euros (€)' },
  { value: 'km', symbol: 'km', label: 'kilómetros (km)' },
  { value: 'kg', symbol: 'kg', label: 'kilos (kg)' },
  { value: 'pct', symbol: '%', label: 'por ciento (%)' },
  { value: 'min', symbol: 'min', label: 'minutos (min)' },
  { value: 'none', symbol: '—', label: 'sin unidad' },
  { value: 'custom', symbol: '…', label: 'otra…' },
]
export const UNIT_MAX = 8

// El símbolo que se guarda/muestra para una clave de unidad (vacío = sin unidad).
export function symbolFor(unitKey: string, custom: string): string {
  if (unitKey === 'custom') return custom.trim()
  if (unitKey === 'none') return ''
  return UNIT_OPTIONS.find((u) => u.value === unitKey)?.symbol ?? ''
}

// Inversa de `symbolFor`: dado el símbolo guardado (p. ej. '€', 'km', o uno
// personalizado), resuelve qué `unitKey` seleccionar en el editor y, si no
// coincide con ninguna opción fija, lo trata como personalizado. `null`/'' →
// 'none' (sin unidad), igual que al crear.
export function unitKeyFor(symbol: string | null): { unitKey: string; customUnit: string } {
  const trimmed = symbol?.trim() ?? ''
  if (trimmed === '') return { unitKey: 'none', customUnit: '' }
  const match = UNIT_OPTIONS.find(
    (u) => u.value !== 'custom' && u.value !== 'none' && u.symbol === trimmed,
  )
  if (match) return { unitKey: match.value, customUnit: '' }
  return { unitKey: 'custom', customUnit: trimmed }
}

/**
 * Parsea la respuesta escrita (formato es-ES: coma decimal) a número, infiriendo
 * los DECIMALES de cómo se escribió (lo que pide el reto). Devuelve null si no es
 * un número válido. "84,50" → { value: 84.5, decimals: 2 }.
 */
export function parseAnswer(raw: string): { value: number; decimals: number } | null {
  // El UnitInput ya filtra a dígitos, coma/punto y signo; aquí normalizamos el
  // punto a coma para tratar ambos separadores y validamos el formato es-ES.
  const cleaned = raw.trim().replace(/\s/g, '').replace(/\./g, ',')
  if (cleaned === '') return null
  if (!/^\d+(,\d+)?$/.test(cleaned)) return null
  const [intPart, decPart = ''] = cleaned.split(',')
  const value = Number(`${intPart}.${decPart}`)
  if (!Number.isFinite(value)) return null
  return { value, decimals: Math.min(decPart.length, 4) }
}
