import type { GroupPrizes } from '../../lib/database.types'

// Orden y etiqueta de cada puesto premiable. `last` = el último de la
// clasificación. Compartido por el editor y el render de chips, así no se
// desincronizan etiquetas. La marca visual es una medalla de línea (rank 1-3) o,
// para el último, la meta (icono Flag); sin emojis.
export interface PrizeSlot {
  key: keyof GroupPrizes
  label: string
  /** Puesto de la medalla de línea (1-3); ausente en `last`, que usa la meta. */
  rank?: 1 | 2 | 3
}

export const PRIZE_SLOTS: PrizeSlot[] = [
  { key: 'first', label: '1º', rank: 1 },
  { key: 'second', label: '2º', rank: 2 },
  { key: 'third', label: '3º', rank: 3 },
  { key: 'last', label: 'Último' },
]

// Devuelve el premio de una fila según su puesto: índice 0/1/2 → first/second/third,
// y la última fila → `last`. Un mismo puesto puede ser primero y último a la vez
// (un solo jugador): preferimos el premio "alto" (first manda sobre last). Solo
// devuelve premio si esa posición lo tiene definido.
export function prizeForRow(
  prizes: GroupPrizes | null,
  index: number,
  total: number,
): string | null {
  if (!prizes) return null
  const byRank: (keyof GroupPrizes | undefined)[] = ['first', 'second', 'third']
  const high = byRank[index]
  if (high && prizes[high]?.trim()) return prizes[high]?.trim() ?? null
  if (index === total - 1 && prizes.last?.trim()) return prizes.last.trim()
  return null
}
