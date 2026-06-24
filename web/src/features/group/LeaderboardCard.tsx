import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { prizeForRow } from './prizes'
import styles from './LeaderboardCard.module.css'

interface Props {
  groupName: string
  entries: LeaderboardEntry[]
  prizes: GroupPrizes | null
  /** Dominio/llamada para el pie (sin protocolo, p.ej. locationguesser-sage.vercel.app). */
  domain: string
  /** Foto del último reto como data URL (incrustada, same-origin para el snapshot).
   * Null si el grupo no tiene retos con foto: la tarjeta se dibuja sin miniatura. */
  photoDataUrl: string | null
}

// Medalla por puesto: oro/plata/bronce y luego el número del puesto.
function medalFor(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}`
}

// Inicial del nombre para los discos del podio (respaldo cuando no hay avatar).
function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
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

// Clase de color del puesto (oro/plata/bronce o teal para el resto). Reutilizada
// por el disco del podio, la medalla de la lista y el relleno de la barra.
function rankClassOf(styleMap: typeof styles, index: number): string {
  if (index === 0) return styleMap.gold
  if (index === 1) return styleMap.silver
  if (index === 2) return styleMap.bronze
  return styleMap.other
}

// Una columna del podio (avatar-disco + nombre + puntos + premio). El orden
// visual (2-1-3) lo da el CSS; aquí solo describimos cada plaza.
function PodiumColumn({
  entry,
  index,
  prize,
  place,
}: {
  entry: LeaderboardEntry
  index: number
  prize: string | null
  // Clase de la plaza para la altura del pedestal (1ª más alta).
  place: string
}) {
  const rankClass = rankClassOf(styles, index)
  return (
    <div className={`${styles.podiumCol} ${place}`}>
      {index === 0 && (
        <span className={styles.crown} aria-hidden="true">
          👑
        </span>
      )}
      <span className={`${styles.podiumDisc} ${rankClass}`}>{initialOf(entry.name)}</span>
      <span className={styles.podiumName}>{entry.name}</span>
      <span className={styles.podiumPoints}>{entry.points.toLocaleString('es-ES')}</span>
      {prize && <span className={styles.podiumPrize}>🎁 {prize}</span>}
      <span className={`${styles.pedestal} ${rankClass}`}>
        <span className={styles.pedestalMedal} aria-hidden="true">
          {medalFor(index)}
        </span>
      </span>
    </div>
  )
}

/**
 * Tarjeta de clasificación para compartir como imagen (poster vertical, ancho
 * 1080, alto que CRECE con el nº de jugadores: todos salen, nadie se trunca).
 * Pensada para snapshot con html-to-image: usa SOLO colores/gradientes/bordes
 * sólidos (sin backdrop-filter/filter/sombras de glow) para que la captura salga
 * fiel y nítida. Se monta fuera del viewport a tamaño real; el ref apunta al nodo
 * raíz que se rasteriza. Función presentacional pura.
 *
 * Top-3 como PODIO visual (2-1-3, con discos, corona y pedestales); del 4º en
 * adelante, lista compacta con barra relativa al líder. Si hay <3 jugadores no
 * hay podio y la lista los muestra todos.
 */
export const LeaderboardCard = forwardRef<HTMLDivElement, Props>(function LeaderboardCard(
  { groupName, entries, prizes, domain, photoDataUrl },
  ref,
) {
  // Barra relativa al líder: el primero llena al 100% y el resto en proporción.
  const top = entries[0]?.points ?? 0
  const prizesText = prizesLine(prizes)

  // Con 3+ jugadores mostramos podio para el top-3 y lista para el resto. Con
  // menos, todos van a la lista (un podio de 1-2 plazas se ve pobre).
  const hasPodium = entries.length >= 3
  const podium = hasPodium ? entries.slice(0, 3) : []
  const restStartIndex = hasPodium ? 3 : 0
  const rest = entries.slice(restStartIndex)

  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.logoMark} aria-hidden="true">
          📍
        </span>
        <div className={styles.brandText}>
          <span className={styles.brandName}>LocationGuesser</span>
          <span className={styles.brandTag}>Adivina dónde son las fotos</span>
        </div>
      </div>

      <div className={styles.headerRow}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>Clasificación</span>
          <h1 className={styles.groupName}>{groupName}</h1>
        </div>
        {/* Miniatura del último reto: contexto visual de la foto que se juega.
            Va como data URL (incrustada) para que el snapshot no la deje en blanco. */}
        {photoDataUrl && (
          <div className={styles.thumb}>
            <img className={styles.thumbImg} src={photoDataUrl} alt="" aria-hidden="true" />
            <span className={styles.thumbTag}>Último reto</span>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          Aún no hay clasificación.
          <br />
          ¡Únete y abre la tabla!
        </div>
      ) : (
        <div className={styles.board}>
          {hasPodium && (
            <div className={styles.podium}>
              {/* Orden DOM 2-1-3: el CSS lo coloca con la 1ª plaza al centro y
                  más alta. Cada columna lleva su clase de plaza para la altura. */}
              <PodiumColumn
                entry={podium[1]}
                index={1}
                place={styles.placeSecond}
                prize={prizeForRow(prizes, 1, entries.length)}
              />
              <PodiumColumn
                entry={podium[0]}
                index={0}
                place={styles.placeFirst}
                prize={prizeForRow(prizes, 0, entries.length)}
              />
              <PodiumColumn
                entry={podium[2]}
                index={2}
                place={styles.placeThird}
                prize={prizeForRow(prizes, 2, entries.length)}
              />
            </div>
          )}

          {rest.length > 0 && (
            <ol className={styles.list} start={restStartIndex + 1}>
              {rest.map((entry, j) => {
                const i = restStartIndex + j
                const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
                const prize = prizeForRow(prizes, i, entries.length)
                const rankClass = rankClassOf(styles, i)
                return (
                  <li key={entry.userId} className={`${styles.row} ${i < 3 ? styles.topRow : ''}`}>
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
            </ol>
          )}
        </div>
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
