import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { prizeForRow } from './prizes'
import styles from './LeaderboardCard.module.css'

// Cuántas filas entran en la tarjeta antes de resumir el resto con "+N más".
// 8 mantiene el poster legible y con barras anchas en el formato vertical.
const MAX_ROWS = 8

interface Props {
  groupName: string
  entries: LeaderboardEntry[]
  prizes: GroupPrizes | null
  /** Dominio/llamada para el pie (sin protocolo, p.ej. locationguesser-sage.vercel.app). */
  domain: string
}

// Medalla por puesto: oro/plata/bronce y luego el número del puesto.
function medalFor(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}`
}

// Línea de premios "en juego" para el pie de la tarjeta (mismo orden que el chat).
function prizesLine(prizes: GroupPrizes | null): string | null {
  if (!prizes) return null
  const parts: string[] = []
  if (prizes.first?.trim()) parts.push(`🥇 ${prizes.first.trim()}`)
  if (prizes.second?.trim()) parts.push(`🥈 ${prizes.second.trim()}`)
  if (prizes.third?.trim()) parts.push(`🥉 ${prizes.third.trim()}`)
  if (prizes.last?.trim()) parts.push(`🏁 ${prizes.last.trim()}`)
  return parts.length > 0 ? parts.join('  ·  ') : null
}

/**
 * Tarjeta de clasificación para compartir como imagen (poster vertical 1080×1350).
 * Pensada para snapshot con html-to-image: usa SOLO colores/gradientes/bordes
 * sólidos (sin backdrop-filter/filter/sombras de glow) para que la captura salga
 * fiel y nítida. Se monta fuera del viewport a tamaño real; el ref apunta al nodo
 * raíz que se rasteriza. Función presentacional pura.
 */
export const LeaderboardCard = forwardRef<HTMLDivElement, Props>(function LeaderboardCard(
  { groupName, entries, prizes, domain },
  ref,
) {
  const shown = entries.slice(0, MAX_ROWS)
  const extra = entries.length - shown.length
  // Barra relativa al líder: el primero llena al 100% y el resto en proporción.
  const top = entries[0]?.points ?? 0
  const prizesText = prizesLine(prizes)

  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.logoMark} aria-hidden="true">
          📍
        </span>
        <span className={styles.brandName}>LocationGuesser</span>
      </div>

      <div className={styles.header}>
        <span className={styles.eyebrow}>Clasificación</span>
        <h1 className={styles.groupName}>{groupName}</h1>
      </div>

      {shown.length === 0 ? (
        <div className={styles.empty}>
          Aún no hay clasificación.
          <br />
          ¡Únete y abre la tabla!
        </div>
      ) : (
        <ol className={styles.list}>
          {shown.map((entry, i) => {
            const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
            const prize = prizeForRow(prizes, i, entries.length)
            const rankClass =
              i === 0
                ? styles.gold
                : i === 1
                  ? styles.silver
                  : i === 2
                    ? styles.bronze
                    : styles.other
            return (
              <li key={entry.userId} className={`${styles.row} ${i < 3 ? styles.podium : ''}`}>
                <span className={`${styles.medal} ${rankClass}`}>{medalFor(i)}</span>
                <div className={styles.mid}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{entry.name}</span>
                    {prize && <span className={styles.prize}>🎁 {prize}</span>}
                  </div>
                  <span className={styles.bar} aria-hidden="true">
                    <i className={rankClass} style={{ width: `${width}%` } as CSSProperties} />
                  </span>
                </div>
                <span className={styles.points}>{entry.points.toLocaleString('es-ES')}</span>
              </li>
            )
          })}
          {extra > 0 && <li className={styles.more}>+{extra} más</li>}
        </ol>
      )}

      {prizesText && (
        <div className={styles.prizesBox}>
          <span className={styles.prizesLabel}>🎁 En juego</span>
          <span className={styles.prizesValue}>{prizesText}</span>
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.footerCta}>Únete y juega</span>
        <span className={styles.footerDomain}>{domain}</span>
      </div>
    </div>
  )
})
