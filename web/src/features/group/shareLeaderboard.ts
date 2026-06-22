import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'

// Cuántos jugadores entran en el resumen antes de truncar (los demás se resumen
// con "…"). 10 mantiene el mensaje legible en el chat sin perder el podio.
const MAX_ROWS = 10

// Medalla por puesto para el resumen de texto: oro/plata/bronce y luego "N.".
function rowPrefix(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

// Línea de premios "en juego": solo las posiciones con premio definido, en el
// orden 1º/2º/3º/último (lo que más motiva: ganar y no quedar el último).
function prizesLine(prizes: GroupPrizes | null): string | null {
  if (!prizes) return null
  const parts: string[] = []
  if (prizes.first?.trim()) parts.push(`🥇 ${prizes.first.trim()}`)
  if (prizes.second?.trim()) parts.push(`🥈 ${prizes.second.trim()}`)
  if (prizes.third?.trim()) parts.push(`🥉 ${prizes.third.trim()}`)
  if (prizes.last?.trim()) parts.push(`🏁 ${prizes.last.trim()}`)
  if (parts.length === 0) return null
  return `🎁 En juego: ${parts.join(' · ')}`
}

// Construye el resumen en texto de la clasificación para compartir en el chat
// del grupo. Función pura (testeable): no toca el DOM ni navigator. Si no hay
// clasificación, invita a unirse igualmente con el enlace.
export function buildShareText(
  groupName: string,
  entries: LeaderboardEntry[],
  prizes: GroupPrizes | null,
  link: string,
): string {
  const lines: string[] = [`🏆 Clasificación · ${groupName}`]

  if (entries.length === 0) {
    lines.push('Aún no hay clasificación, ¡únete y abre la tabla!')
  } else {
    const shown = entries.slice(0, MAX_ROWS)
    for (let i = 0; i < shown.length; i++) {
      const e = shown[i]
      lines.push(`${rowPrefix(i)} ${e.name} — ${e.points.toLocaleString('es-ES')}`)
    }
    if (entries.length > MAX_ROWS) lines.push('…')
  }

  const prizesText = prizesLine(prizes)
  if (prizesText) lines.push(prizesText)

  lines.push(`👉 Únete y juega: ${link}`)
  return lines.join('\n')
}
