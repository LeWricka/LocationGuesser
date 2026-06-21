import type { GroupPrizes } from '../../lib/database.types'

// Orden y etiqueta de cada puesto premiable. `last` = el último de la
// clasificación. Compartido por el editor y el render de chips, así no se
// desincronizan etiquetas/emojis.
export const PRIZE_SLOTS: { key: keyof GroupPrizes; label: string }[] = [
  { key: 'first', label: '🥇 1º' },
  { key: 'second', label: '🥈 2º' },
  { key: 'third', label: '🥉 3º' },
  { key: 'last', label: '🏁 Último' },
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
