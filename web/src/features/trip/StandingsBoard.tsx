import type { CSSProperties } from 'react'
import { Avatar } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { Podium, type PodiumClasses } from '../group/Podium'

/**
 * Clases del podio (`PodiumClasses`, compartidas) + las de la lista compacta
 * que se pinta en su lugar con MENOS de 3 jugadores (sin podio posible). Cada
 * consumidor (recap de cierre `TripWrap`, cierre de la Bitácora) inyecta su
 * propio módulo CSS con su escala — mismo patrón documentado en `Podium.tsx`:
 * el MARKUP se comparte, la escala visual no.
 */
export interface StandingsClasses extends PodiumClasses {
  board: string
  row: string
  rank: string
  player: string
  playerName: string
  rowRight: string
  bar: string
  rowPoints: string
}

interface Props {
  /** Clasificación general, orden desc (ya agregada, `aggregateLeaderboard`). */
  leaderboard: LeaderboardEntry[]
  prizes: GroupPrizes | null
  classes: StandingsClasses
}

/**
 * Top-3 en podio (`Podium`, compartido con el recap de cierre) o, con menos de
 * 3 jugadores, una lista compacta a secas — mismo criterio que `TripWrap`
 * (issue #822: reutiliza la MISMA pieza en vez de duplicar el markup de la
 * clasificación en la Bitácora). Sin ninguna jugada, no pinta nada (el
 * llamador decide si mostrar la sección entera).
 */
export function StandingsBoard({ leaderboard, prizes, classes }: Props) {
  if (leaderboard.length === 0) return null

  const hasPodium = leaderboard.length >= 3
  if (hasPodium) {
    return (
      <Podium
        top3={leaderboard.slice(0, 3)}
        prizes={prizes}
        totalEntries={leaderboard.length}
        classes={classes}
      />
    )
  }

  const top = leaderboard[0]?.points ?? 0
  return (
    <ol className={classes.board}>
      {leaderboard.map((entry, i) => {
        const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
        return (
          <li key={entry.userId} className={classes.row} style={{ '--i': i } as CSSProperties}>
            <span className={classes.rank}>{i + 1}</span>
            <div className={classes.player}>
              <Avatar userId={entry.userId} avatarUrl={entry.avatar} name={entry.name} size="sm" />
              <span className={classes.playerName}>{entry.name}</span>
            </div>
            <div className={classes.rowRight}>
              <span className={classes.bar} aria-hidden="true">
                <i style={{ width: `${width}%` }} />
              </span>
              <span className={classes.rowPoints}>{entry.points.toLocaleString('es-ES')}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
